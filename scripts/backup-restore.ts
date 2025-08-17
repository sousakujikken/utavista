#!/usr/bin/env tsx

/**
 * Backup and Restore Utilities - Step 2 Implementation
 * 
 * Provides comprehensive backup and rollback capabilities
 * for template migration safety.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';
import * as crypto from 'crypto';

interface BackupInfo {
  backupId: string;
  timestamp: string;
  description: string;
  files: BackupFileInfo[];
  gitCommit?: string;
  metadata: {
    totalFiles: number;
    totalSize: number;
    checksum: string;
  };
}

interface BackupFileInfo {
  originalPath: string;
  backupPath: string;
  size: number;
  checksum: string;
  lastModified: string;
}

interface RestoreResult {
  success: boolean;
  restoredFiles: number;
  errors: string[];
  warnings: string[];
}

class BackupManager {
  private backupDir: string;
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
    this.backupDir = path.join(basePath, '.template-migration-backups');
  }

  /**
   * Create comprehensive backup before migration
   */
  async createBackup(description: string = 'Template migration backup'): Promise<BackupInfo> {
    const backupId = `backup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    
    console.log(`💾 Creating backup: ${backupId}`);
    console.log(`📝 Description: ${description}`);

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      // Create backup subdirectory
      const backupPath = path.join(this.backupDir, backupId);
      await fs.mkdir(backupPath, { recursive: true });

      // Get git commit info (if available)
      let gitCommit: string | undefined;
      try {
        gitCommit = execSync('git rev-parse HEAD', { cwd: this.basePath, encoding: 'utf-8' }).trim();
        console.log(`📋 Current Git Commit: ${gitCommit.substring(0, 8)}`);
      } catch (error) {
        console.warn('⚠️ Git not available or not in a git repository');
      }

      // Discover files to backup
      const filesToBackup = await this.discoverFilesToBackup();
      console.log(`📁 Found ${filesToBackup.length} files to backup`);

      // Create backups
      const backupFiles: BackupFileInfo[] = [];
      let totalSize = 0;

      for (const filePath of filesToBackup) {
        const backupFileInfo = await this.backupFile(filePath, backupPath);
        backupFiles.push(backupFileInfo);
        totalSize += backupFileInfo.size;
        
        // Progress indicator
        if (backupFiles.length % 10 === 0) {
          console.log(`📦 Backed up ${backupFiles.length}/${filesToBackup.length} files...`);
        }
      }

      // Generate overall checksum
      const checksums = backupFiles.map(f => f.checksum).sort();
      const overallChecksum = crypto.createHash('sha256')
        .update(checksums.join(''))
        .digest('hex');

      // Create backup info
      const backupInfo: BackupInfo = {
        backupId,
        timestamp,
        description,
        files: backupFiles,
        gitCommit,
        metadata: {
          totalFiles: backupFiles.length,
          totalSize,
          checksum: overallChecksum
        }
      };

      // Save backup info
      const infoPath = path.join(backupPath, 'backup-info.json');
      await fs.writeFile(infoPath, JSON.stringify(backupInfo, null, 2), 'utf-8');

      // Create restoration script
      await this.createRestorationScript(backupPath, backupInfo);

      console.log(`✅ Backup created successfully: ${backupId}`);
      console.log(`📊 Backed up ${backupFiles.length} files (${this.formatSize(totalSize)})`);
      console.log(`📂 Backup location: ${backupPath}`);

      return backupInfo;

    } catch (error) {
      console.error(`❌ Backup creation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string, options: {
    dryRun?: boolean;
    force?: boolean;
    selectiveRestore?: string[];
  } = {}): Promise<RestoreResult> {
    console.log(`🔄 ${options.dryRun ? 'Simulating' : 'Starting'} restore from backup: ${backupId}`);

    const result: RestoreResult = {
      success: false,
      restoredFiles: 0,
      errors: [],
      warnings: []
    };

    try {
      // Load backup info
      const backupPath = path.join(this.backupDir, backupId);
      const infoPath = path.join(backupPath, 'backup-info.json');
      
      const backupInfoContent = await fs.readFile(infoPath, 'utf-8');
      const backupInfo: BackupInfo = JSON.parse(backupInfoContent);

      console.log(`📋 Backup Info: ${backupInfo.description} (${backupInfo.timestamp})`);
      console.log(`📊 Files to restore: ${backupInfo.files.length}`);

      // Verify backup integrity
      console.log('🔍 Verifying backup integrity...');
      const integrityCheck = await this.verifyBackupIntegrity(backupPath, backupInfo);
      if (!integrityCheck.valid) {
        result.errors.push(`Backup integrity check failed: ${integrityCheck.errors.join(', ')}`);
        return result;
      }

      // Filter files for selective restore
      let filesToRestore = backupInfo.files;
      if (options.selectiveRestore && options.selectiveRestore.length > 0) {
        filesToRestore = backupInfo.files.filter(file => 
          options.selectiveRestore!.some(pattern => 
            file.originalPath.includes(pattern)
          )
        );
        console.log(`🎯 Selective restore: ${filesToRestore.length} files match criteria`);
      }

      // Check for conflicts (if not force mode)
      if (!options.force) {
        const conflicts = await this.checkRestoreConflicts(filesToRestore);
        if (conflicts.length > 0) {
          result.warnings.push(`${conflicts.length} files would be overwritten`);
          if (!options.dryRun) {
            console.warn('⚠️ Use --force to overwrite existing files');
            result.errors.push('Restore cancelled due to conflicts');
            return result;
          }
        }
      }

      // Perform restore
      for (const fileInfo of filesToRestore) {
        try {
          if (options.dryRun) {
            console.log(`[DRY RUN] Would restore: ${fileInfo.originalPath}`);
          } else {
            await this.restoreFile(fileInfo, backupPath);
            console.log(`✅ Restored: ${fileInfo.originalPath}`);
          }
          result.restoredFiles++;
        } catch (error) {
          const errorMsg = `Failed to restore ${fileInfo.originalPath}: ${error}`;
          result.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      result.success = result.errors.length === 0;

      if (!options.dryRun && result.success) {
        console.log(`✅ Restore completed successfully: ${result.restoredFiles} files restored`);
      } else if (options.dryRun) {
        console.log(`🔍 Dry run completed: ${result.restoredFiles} files would be restored`);
      }

      return result;

    } catch (error) {
      result.errors.push(`Restore process failed: ${error}`);
      console.error(`❌ Restore failed: ${error}`);
      return result;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const backupDirs = await fs.readdir(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const backupId of backupDirs) {
        if (backupId.startsWith('backup-')) {
          try {
            const infoPath = path.join(this.backupDir, backupId, 'backup-info.json');
            const infoContent = await fs.readFile(infoPath, 'utf-8');
            const backupInfo: BackupInfo = JSON.parse(infoContent);
            backups.push(backupInfo);
          } catch (error) {
            console.warn(`⚠️ Could not read backup info for ${backupId}: ${error}`);
          }
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return backups;
    } catch (error) {
      console.warn('⚠️ No backups found or backup directory not accessible');
      return [];
    }
  }

  /**
   * Delete old backups
   */
  async cleanupBackups(options: {
    keepCount?: number;
    olderThanDays?: number;
    dryRun?: boolean;
  } = {}): Promise<{ deletedCount: number; freedSpace: number }> {
    const { keepCount = 5, olderThanDays = 30, dryRun = false } = options;
    
    console.log(`🧹 ${dryRun ? 'Simulating' : 'Starting'} backup cleanup...`);
    
    const backups = await this.listBackups();
    let toDelete: BackupInfo[] = [];
    
    // Keep only specified number of backups
    if (backups.length > keepCount) {
      toDelete.push(...backups.slice(keepCount));
    }

    // Remove backups older than specified days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const oldBackups = backups.filter(backup => 
      new Date(backup.timestamp) < cutoffDate &&
      !toDelete.includes(backup)
    );
    
    toDelete.push(...oldBackups);

    let deletedCount = 0;
    let freedSpace = 0;

    for (const backup of toDelete) {
      try {
        if (dryRun) {
          console.log(`[DRY RUN] Would delete: ${backup.backupId} (${this.formatSize(backup.metadata.totalSize)})`);
        } else {
          const backupPath = path.join(this.backupDir, backup.backupId);
          await fs.rm(backupPath, { recursive: true, force: true });
          console.log(`🗑️ Deleted backup: ${backup.backupId}`);
        }
        deletedCount++;
        freedSpace += backup.metadata.totalSize;
      } catch (error) {
        console.error(`❌ Failed to delete backup ${backup.backupId}: ${error}`);
      }
    }

    console.log(`✅ Cleanup completed: ${deletedCount} backups ${dryRun ? 'would be' : ''} deleted (${this.formatSize(freedSpace)} freed)`);

    return { deletedCount, freedSpace };
  }

  /**
   * Discover files that need to be backed up
   */
  private async discoverFilesToBackup(): Promise<string[]> {
    const patterns = [
      'src/renderer/templates/*.ts',
      'src/renderer/templates/index.ts',
      'src/renderer/templates/registry/**/*.ts',
      'src/renderer/templates/registry/**/*.json',
      'src/renderer/types/types.ts',
      'src/renderer/types/TemplateParameters.ts'
    ];

    const files: string[] = [];
    
    for (const pattern of patterns) {
      try {
        const { glob: globFunc } = await import('glob');
        const matches = await globFunc(pattern, { cwd: this.basePath });
        if (Array.isArray(matches)) {
          files.push(...matches.map(match => path.resolve(this.basePath, match)));
        }
      } catch (error) {
        console.warn(`Warning: Could not process pattern ${pattern}:`, error);
      }
    }

    // Remove duplicates and ensure files exist
    const uniqueFiles = [...new Set(files)];
    const existingFiles: string[] = [];

    for (const file of uniqueFiles) {
      try {
        await fs.access(file);
        existingFiles.push(file);
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    return existingFiles;
  }

  /**
   * Backup individual file
   */
  private async backupFile(filePath: string, backupPath: string): Promise<BackupFileInfo> {
    const relativePath = path.relative(this.basePath, filePath);
    const backupFilePath = path.join(backupPath, 'files', relativePath);
    
    // Ensure backup directory exists
    await fs.mkdir(path.dirname(backupFilePath), { recursive: true });
    
    // Copy file
    await fs.copyFile(filePath, backupFilePath);
    
    // Get file stats and checksum
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    return {
      originalPath: filePath,
      backupPath: backupFilePath,
      size: stats.size,
      checksum,
      lastModified: stats.mtime.toISOString()
    };
  }

  /**
   * Restore individual file
   */
  private async restoreFile(fileInfo: BackupFileInfo, backupPath: string): Promise<void> {
    // Ensure target directory exists
    await fs.mkdir(path.dirname(fileInfo.originalPath), { recursive: true });
    
    // Copy file back
    await fs.copyFile(fileInfo.backupPath, fileInfo.originalPath);
    
    // Verify restoration
    const content = await fs.readFile(fileInfo.originalPath);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    
    if (checksum !== fileInfo.checksum) {
      throw new Error(`Checksum mismatch after restoration: expected ${fileInfo.checksum}, got ${checksum}`);
    }
  }

  /**
   * Verify backup integrity
   */
  private async verifyBackupIntegrity(backupPath: string, backupInfo: BackupInfo): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    for (const fileInfo of backupInfo.files) {
      try {
        // Check if backup file exists
        await fs.access(fileInfo.backupPath);
        
        // Verify checksum
        const content = await fs.readFile(fileInfo.backupPath);
        const checksum = crypto.createHash('sha256').update(content).digest('hex');
        
        if (checksum !== fileInfo.checksum) {
          errors.push(`Checksum mismatch for ${fileInfo.originalPath}`);
        }
      } catch (error) {
        errors.push(`Cannot access backup file: ${fileInfo.backupPath}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check for restore conflicts
   */
  private async checkRestoreConflicts(filesToRestore: BackupFileInfo[]): Promise<string[]> {
    const conflicts: string[] = [];

    for (const fileInfo of filesToRestore) {
      try {
        await fs.access(fileInfo.originalPath);
        conflicts.push(fileInfo.originalPath);
      } catch (error) {
        // File doesn't exist, no conflict
      }
    }

    return conflicts;
  }

  /**
   * Create restoration script
   */
  private async createRestorationScript(backupPath: string, backupInfo: BackupInfo): Promise<void> {
    const scriptContent = `#!/bin/bash
# Automatic restoration script for backup: ${backupInfo.backupId}
# Created: ${backupInfo.timestamp}
# Description: ${backupInfo.description}

set -e

echo "🔄 Restoring from backup: ${backupInfo.backupId}"
echo "📝 Description: ${backupInfo.description}"
echo "📅 Created: ${backupInfo.timestamp}"
echo "📊 Files: ${backupInfo.metadata.totalFiles}"
echo ""

read -p "Continue with restoration? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restoration cancelled"
    exit 1
fi

${backupInfo.files.map(file => {
  const relativePath = path.relative(this.basePath, file.originalPath);
  return `echo "📁 Restoring: ${relativePath}"
mkdir -p "$(dirname "${file.originalPath}")"
cp "${file.backupPath}" "${file.originalPath}"`;
}).join('\n\n')}

echo ""
echo "✅ Restoration completed successfully!"
echo "📊 Restored ${backupInfo.metadata.totalFiles} files"
`;

    const scriptPath = path.join(backupPath, 'restore.sh');
    await fs.writeFile(scriptPath, scriptContent, 'utf-8');
    
    // Make script executable
    try {
      await fs.chmod(scriptPath, 0o755);
    } catch (error) {
      // Ignore chmod errors on Windows
    }
  }

  /**
   * Format file size for display
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const command = process.argv[2];
  const basePath = process.cwd();
  const manager = new BackupManager(basePath);

  try {
    switch (command) {
      case 'create':
        const description = process.argv[3] || 'Manual backup';
        const backup = await manager.createBackup(description);
        console.log(`📋 Backup ID: ${backup.backupId}`);
        break;
        
      case 'restore':
        const backupId = process.argv[3];
        if (!backupId) {
          console.error('❌ Please specify backup ID');
          process.exit(1);
        }
        
        const options = {
          dryRun: process.argv.includes('--dry-run'),
          force: process.argv.includes('--force'),
          selectiveRestore: process.argv.includes('--selective') ? 
            process.argv.slice(process.argv.indexOf('--selective') + 1) : undefined
        };
        
        const result = await manager.restoreFromBackup(backupId, options);
        process.exit(result.success ? 0 : 1);
        break;
        
      case 'list':
        const backups = await manager.listBackups();
        if (backups.length === 0) {
          console.log('📭 No backups found');
        } else {
          console.log('📋 Available backups:');
          backups.forEach(backup => {
            console.log(`  ${backup.backupId}`);
            console.log(`    📅 ${backup.timestamp}`);
            console.log(`    📝 ${backup.description}`);
            console.log(`    📊 ${backup.metadata.totalFiles} files (${manager['formatSize'](backup.metadata.totalSize)})`);
            if (backup.gitCommit) {
              console.log(`    📋 Git: ${backup.gitCommit.substring(0, 8)}`);
            }
            console.log('');
          });
        }
        break;
        
      case 'cleanup':
        const cleanupOptions = {
          keepCount: parseInt(process.argv[3]) || 5,
          olderThanDays: parseInt(process.argv[4]) || 30,
          dryRun: process.argv.includes('--dry-run')
        };
        
        await manager.cleanupBackups(cleanupOptions);
        break;
        
      default:
        console.log('📚 Usage:');
        console.log('  npm run backup create [description]');
        console.log('  npm run backup restore <backup-id> [--dry-run] [--force]');
        console.log('  npm run backup list');
        console.log('  npm run backup cleanup [keep-count] [older-than-days] [--dry-run]');
        break;
    }
  } catch (error) {
    console.error('💥 Operation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { BackupManager, BackupInfo, RestoreResult };