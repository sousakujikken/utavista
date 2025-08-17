#!/usr/bin/env tsx

/**
 * Template Validation Script - Step 2 Implementation
 * 
 * Uses the improved validation schema to comprehensively test
 * templates before and after migration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Import improved validation system
import { 
  ImprovedTemplateValidator, 
  ImprovedValidationReporter,
  ValidationSummary,
  TemplateValidationResult 
} from '../src/renderer/templates/validation/ImprovedTemplateValidationSchema';

const execAsync = promisify(exec);

interface ValidationConfig {
  templateDir: string;
  skipRuntimeTests: boolean;
  generateDetailedReport: boolean;
  validateTypes: boolean;
  checkMemoryLeaks: boolean;
}

interface ValidationSession {
  sessionId: string;
  timestamp: string;
  config: ValidationConfig;
  results: ValidationSummary;
  performanceMetrics: {
    totalTime: number;
    templatesPerSecond: number;
    memoryUsage: NodeJS.MemoryUsage;
  };
  compilerResults?: {
    success: boolean;
    errors: string[];
    warnings: string[];
  };
}

class TemplateValidationRunner {
  private sessionId: string;
  private startTime: number = 0;

  constructor(private config: ValidationConfig) {
    this.sessionId = `validation-${Date.now()}`;
  }

  /**
   * Run comprehensive template validation
   */
  async runValidation(): Promise<ValidationSession> {
    console.log('🔍 Starting Comprehensive Template Validation...');
    console.log(`📁 Template Directory: ${this.config.templateDir}`);
    console.log(`⚙️ Session ID: ${this.sessionId}`);

    this.startTime = Date.now();

    try {
      // Step 1: Discover and load templates
      const templates = await this.loadTemplates();
      console.log(`📦 Loaded ${Object.keys(templates).length} templates for validation`);

      // Step 2: Run TypeScript compilation check (if enabled)
      let compilerResults;
      if (this.config.validateTypes) {
        console.log('🔧 Running TypeScript compilation check...');
        compilerResults = await this.validateTypeScriptCompilation();
      }

      // Step 3: Run template validation using improved schema
      console.log('🧪 Running template validation tests...');
      const results = await ImprovedTemplateValidator.validateTemplates(templates);

      // Step 4: Generate performance metrics
      const performanceMetrics = this.generatePerformanceMetrics(results);

      const session: ValidationSession = {
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        config: this.config,
        results,
        performanceMetrics,
        compilerResults
      };

      // Step 5: Generate reports
      await this.generateReports(session);

      return session;

    } catch (error) {
      console.error('💥 Validation failed:', error);
      throw error;
    }
  }

  /**
   * Load templates dynamically from the templates directory
   */
  private async loadTemplates(): Promise<Record<string, any>> {
    const templates: Record<string, any> = {};
    const templateFiles = await this.discoverTemplateFiles();

    for (const filePath of templateFiles) {
      try {
        // Use dynamic import to load the template
        const templateName = path.basename(filePath, '.ts');
        
        console.log(`📥 Loading template: ${templateName}`);
        
        // Skip if it's a validation or registry file
        if (templateName.includes('Validation') || templateName.includes('Registry')) {
          console.log(`⏭️  Skipping non-template file: ${templateName}`);
          continue;
        }
        
        // Try to load from the templates index
        const templatesModule = await import('../src/renderer/templates/index');
        const templateExport = templatesModule[templateName] || templatesModule.default?.[templateName];

        if (templateExport) {
          templates[templateName] = templateExport;
          console.log(`✅ Loaded template: ${templateName}`);
        } else {
          console.warn(`⚠️ No valid export found for template: ${templateName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load template from ${filePath}:`, error);
        // Continue with other templates
      }
    }

    return templates;
  }

  /**
   * Discover template files
   */
  private async discoverTemplateFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.templateDir);
      const templateFiles = files
        .filter(file => file.endsWith('.ts'))
        .filter(file => file !== 'index.ts')
        .filter(file => !file.endsWith('.d.ts'))
        .filter(file => !file.includes('Validation'))
        .filter(file => !file.includes('Registry'))
        .map(file => path.join(this.config.templateDir, file));
      
      // Filter out directories
      const finalFiles: string[] = [];
      for (const file of templateFiles) {
        try {
          const stat = await fs.stat(file);
          if (stat.isFile()) {
            finalFiles.push(file);
          }
        } catch (error) {
          // Skip files that can't be stat'd
          continue;
        }
      }
      
      return finalFiles;
    } catch (error) {
      console.error('Error discovering template files:', error);
      return [];
    }
  }

  /**
   * Validate TypeScript compilation
   */
  private async validateTypeScriptCompilation(): Promise<{
    success: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Run TypeScript compiler
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --skipLibCheck', {
        cwd: process.cwd(),
        timeout: 30000 // 30 second timeout
      });

      // Parse compiler output
      if (stderr) {
        const lines = stderr.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.includes('error TS')) {
            errors.push(line);
          } else if (line.includes('warning') || line.includes('note')) {
            warnings.push(line);
          }
        });
      }

      return {
        success: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`TypeScript compilation failed: ${errorMessage}`);
      
      return {
        success: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Generate performance metrics
   */
  private generatePerformanceMetrics(results: ValidationSummary): {
    totalTime: number;
    templatesPerSecond: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    const totalTime = Date.now() - this.startTime;
    const templatesPerSecond = results.totalTemplates / (totalTime / 1000);
    const memoryUsage = process.memoryUsage();

    return {
      totalTime,
      templatesPerSecond,
      memoryUsage
    };
  }

  /**
   * Generate comprehensive validation reports
   */
  private async generateReports(session: ValidationSession): Promise<void> {
    const { results, performanceMetrics, compilerResults } = session;

    // Generate summary report
    const summaryReport = this.generateSummaryReport(session);
    console.log('\n' + summaryReport);

    // Generate detailed report
    const detailedReport = ImprovedValidationReporter.generateReport(results);
    
    // Generate performance report
    const performanceReport = this.generatePerformanceReport(performanceMetrics);

    // Write reports to files
    const reportsDir = path.join(process.cwd(), 'validation-reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFileName = `validation-${timestamp}`;

    // Summary report
    const summaryPath = path.join(reportsDir, `${baseFileName}-summary.txt`);
    await fs.writeFile(summaryPath, summaryReport, 'utf-8');
    console.log(`📄 Summary report: ${summaryPath}`);

    // Detailed report
    const detailedPath = path.join(reportsDir, `${baseFileName}-detailed.txt`);
    await fs.writeFile(detailedPath, detailedReport, 'utf-8');
    console.log(`📋 Detailed report: ${detailedPath}`);

    // Performance report
    const performancePath = path.join(reportsDir, `${baseFileName}-performance.txt`);
    await fs.writeFile(performancePath, performanceReport, 'utf-8');
    console.log(`⚡ Performance report: ${performancePath}`);

    // JSON report for programmatic use
    const jsonPath = path.join(reportsDir, `${baseFileName}-data.json`);
    await fs.writeFile(jsonPath, JSON.stringify(session, null, 2), 'utf-8');
    console.log(`📊 JSON data: ${jsonPath}`);

    // Compiler report (if available)
    if (compilerResults) {
      const compilerPath = path.join(reportsDir, `${baseFileName}-compiler.txt`);
      const compilerReport = this.generateCompilerReport(compilerResults);
      await fs.writeFile(compilerPath, compilerReport, 'utf-8');
      console.log(`🔧 Compiler report: ${compilerPath}`);
    }
  }

  /**
   * Generate summary report
   */
  private generateSummaryReport(session: ValidationSession): string {
    const { results, performanceMetrics, compilerResults } = session;
    
    const lines = [
      '=== TEMPLATE VALIDATION SUMMARY ===',
      `Session ID: ${session.sessionId}`,
      `Timestamp: ${session.timestamp}`,
      `Duration: ${(performanceMetrics.totalTime / 1000).toFixed(2)}s`,
      '',
      '📊 VALIDATION RESULTS:',
      `  Total Templates: ${results.totalTemplates}`,
      `  Valid Templates: ${results.validTemplates} (${((results.validTemplates / results.totalTemplates) * 100).toFixed(1)}%)`,
      `  Invalid Templates: ${results.invalidTemplates} (${((results.invalidTemplates / results.totalTemplates) * 100).toFixed(1)}%)`,
      `  Overall Status: ${results.overallValid ? '✅ PASS' : '❌ FAIL'}`,
      '',
      '⚡ PERFORMANCE METRICS:',
      `  Processing Speed: ${performanceMetrics.templatesPerSecond.toFixed(2)} templates/second`,
      `  Memory Usage: ${(performanceMetrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      `  Peak Memory: ${(performanceMetrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      ''
    ];

    if (compilerResults) {
      lines.push('🔧 TYPESCRIPT COMPILATION:');
      lines.push(`  Status: ${compilerResults.success ? '✅ PASS' : '❌ FAIL'}`);
      lines.push(`  Errors: ${compilerResults.errors.length}`);
      lines.push(`  Warnings: ${compilerResults.warnings.length}`);
      lines.push('');
    }

    // Failed templates summary
    if (results.invalidTemplates > 0) {
      lines.push('❌ FAILED TEMPLATES:');
      const failedTemplates = results.results.filter(r => !r.isValid);
      failedTemplates.forEach(template => {
        lines.push(`  • ${template.templateId} (${template.errors.length} errors)`);
      });
      lines.push('');
    }

    // Recommendations
    lines.push('💡 RECOMMENDATIONS:');
    if (results.invalidTemplates > 0) {
      lines.push('  • Review detailed report for specific template issues');
      lines.push('  • Fix template implementations before migration');
    }
    if (compilerResults && !compilerResults.success) {
      lines.push('  • Resolve TypeScript compilation errors first');
    }
    if (results.overallValid) {
      lines.push('  • All templates ready for migration ✅');
    }

    return lines.join('\n');
  }

  /**
   * Generate performance report
   */
  private generatePerformanceReport(metrics: any): string {
    const lines = [
      '=== PERFORMANCE ANALYSIS REPORT ===',
      `Total Execution Time: ${(metrics.totalTime / 1000).toFixed(2)} seconds`,
      `Templates Processed: ${metrics.templatesPerSecond.toFixed(2)} per second`,
      '',
      '💾 MEMORY USAGE:',
      `  Heap Used: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      `  Heap Total: ${(metrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      `  RSS: ${(metrics.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      `  External: ${(metrics.memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
      '',
      '📈 PERFORMANCE ANALYSIS:',
      metrics.templatesPerSecond > 5 ? '  ✅ Fast processing speed' : '  ⚠️ Slow processing detected',
      metrics.memoryUsage.heapUsed < 100 * 1024 * 1024 ? '  ✅ Low memory usage' : '  ⚠️ High memory usage',
      '',
      '🎯 OPTIMIZATION RECOMMENDATIONS:',
      metrics.templatesPerSecond < 2 ? '  • Consider optimizing validation logic' : '  • Performance is acceptable',
      metrics.memoryUsage.heapUsed > 200 * 1024 * 1024 ? '  • Memory usage is high - check for leaks' : '  • Memory usage is reasonable'
    ];

    return lines.join('\n');
  }

  /**
   * Generate compiler report
   */
  private generateCompilerReport(compilerResults: any): string {
    const lines = [
      '=== TYPESCRIPT COMPILER REPORT ===',
      `Status: ${compilerResults.success ? '✅ SUCCESS' : '❌ FAILED'}`,
      `Errors: ${compilerResults.errors.length}`,
      `Warnings: ${compilerResults.warnings.length}`,
      ''
    ];

    if (compilerResults.errors.length > 0) {
      lines.push('❌ COMPILATION ERRORS:');
      compilerResults.errors.forEach((error: string) => {
        lines.push(`  • ${error}`);
      });
      lines.push('');
    }

    if (compilerResults.warnings.length > 0) {
      lines.push('⚠️ COMPILATION WARNINGS:');
      compilerResults.warnings.forEach((warning: string) => {
        lines.push(`  • ${warning}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const basePath = process.cwd();
  const templateDir = path.join(basePath, 'src/renderer/templates');

  const config: ValidationConfig = {
    templateDir,
    skipRuntimeTests: process.argv.includes('--skip-runtime'),
    generateDetailedReport: !process.argv.includes('--no-detailed'),
    validateTypes: !process.argv.includes('--no-types'),
    checkMemoryLeaks: !process.argv.includes('--no-memory-check')
  };

  const runner = new TemplateValidationRunner(config);

  try {
    console.log('🚀 Starting Template Validation...');
    console.log(`📁 Base Path: ${basePath}`);
    console.log(`⚙️ Configuration:`, {
      skipRuntimeTests: config.skipRuntimeTests,
      validateTypes: config.validateTypes,
      checkMemoryLeaks: config.checkMemoryLeaks
    });

    const session = await runner.runValidation();

    console.log('\n🎯 Validation Complete!');
    console.log(`📊 Results: ${session.results.validTemplates}/${session.results.totalTemplates} templates passed`);
    console.log(`⚡ Performance: ${session.performanceMetrics.templatesPerSecond.toFixed(2)} templates/second`);
    
    if (session.compilerResults) {
      console.log(`🔧 TypeScript: ${session.compilerResults.success ? 'PASS' : 'FAIL'}`);
    }

    // Exit with appropriate code
    const hasFailures = !session.results.overallValid || 
                       (session.compilerResults && !session.compilerResults.success);
    process.exit(hasFailures ? 1 : 0);

  } catch (error) {
    console.error('💥 Validation process failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { TemplateValidationRunner, ValidationConfig, ValidationSession };