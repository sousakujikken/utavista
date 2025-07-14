import { app, ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TemplateInfo } from '../shared/types';

class TemplateManager {
  private userTemplatesPath: string;
  
  constructor() {
    this.userTemplatesPath = path.join(app.getPath('userData'), 'templates');
  }
  
  async initialize() {
    // Ensure templates directory exists
    await fs.mkdir(this.userTemplatesPath, { recursive: true });
    this.setupIPCHandlers();
  }
  
  private setupIPCHandlers() {
    ipcMain.handle('template:scan-directory', async () => {
      try {
        return await this.scanTemplateDirectory();
      } catch (error) {
        console.error('Error scanning template directory:', error);
        throw error;
      }
    });
    
    ipcMain.handle('template:get-registered-ids', async () => {
      try {
        // This will be populated from the renderer process
        return [];
      } catch (error) {
        console.error('Error getting registered template IDs:', error);
        throw error;
      }
    });
    
    ipcMain.handle('template:copy-to-directory', async (event, sourcePath: string) => {
      try {
        const fileName = path.basename(sourcePath);
        const destPath = path.join(this.userTemplatesPath, fileName);
        
        // Check if file already exists
        const exists = await this.fileExists(destPath);
        if (exists) {
          throw new Error(`Template file ${fileName} already exists in the templates directory`);
        }
        
        // Copy file to templates directory
        await fs.copyFile(sourcePath, destPath);
        
        const stats = await fs.stat(destPath);
        
        return {
          name: path.basename(fileName, path.extname(fileName)),
          path: destPath,
          fileName: fileName,
          size: stats.size,
          lastModified: stats.mtime
        } as TemplateInfo;
      } catch (error) {
        console.error('Error copying template to directory:', error);
        throw error;
      }
    });
    
    ipcMain.handle('template:select-file', async () => {
      try {
        const { filePaths } = await dialog.showOpenDialog({
          title: 'Select Template File',
          filters: [
            { name: 'JavaScript Files', extensions: ['js'] },
            { name: 'TypeScript Files', extensions: ['ts'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        
        if (filePaths.length > 0) {
          return filePaths[0];
        }
        
        return null;
      } catch (error) {
        console.error('Error selecting template file:', error);
        throw error;
      }
    });
    
    ipcMain.handle('template:open-folder', async () => {
      try {
        await this.openTemplateFolder();
      } catch (error) {
        console.error('Error opening template folder:', error);
        throw error;
      }
    });
  }
  
  private async scanTemplateDirectory(): Promise<TemplateInfo[]> {
    const templates: TemplateInfo[] = [];
    
    try {
      const files = await fs.readdir(this.userTemplatesPath, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && this.isTemplateFile(file.name)) {
          const fullPath = path.join(this.userTemplatesPath, file.name);
          const stats = await fs.stat(fullPath);
          
          templates.push({
            name: path.basename(file.name, path.extname(file.name)),
            path: fullPath,
            fileName: file.name,
            size: stats.size,
            lastModified: stats.mtime
          });
        }
      }
    } catch (error) {
      console.error('Error scanning user templates:', error);
    }
    
    return templates;
  }
  
  private isTemplateFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ['.ts', '.js'].includes(ext);
  }
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  private async openTemplateFolder(): Promise<void> {
    const { shell } = await import('electron');
    await shell.openPath(this.userTemplatesPath);
  }
}

export const templateManager = new TemplateManager();