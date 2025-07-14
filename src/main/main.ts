import * as electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import * as path from 'path';
import { setupFileHandlers } from './fileManager';
import { setupExportHandlers } from './exportManager';
import { fontManager } from './fontManager';
import { persistenceManager } from './persistenceManager';

class ElectronApp {
  private mainWindow: BrowserWindowType | null = null;
  
  async initialize() {
    await app.whenReady();
    
    console.log('ElectronApp: Initializing managers...');
    
    // Initialize managers before setting up IPC to ensure all handlers are registered
    await fontManager.initialize();
    console.log('ElectronApp: FontManager initialized');
    
    await persistenceManager.initialize();
    console.log('ElectronApp: PersistenceManager initialized');
    
    this.createMainWindow();
    this.setupIPC();
    this.setupAppEvents();
    
    console.log('ElectronApp: All initialization complete');
  }
  
  private createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 1000,
      minWidth: 1200,
      minHeight: 800,
      titleBarStyle: 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, './preload.js'),
        webSecurity: false, // ローカルファイルアクセスのため無効化
        allowRunningInsecureContent: true
      }
    });
    
    // 開発時は Vite dev server、プロダクション時はバンドルされたHTML
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    if (isDev) {
      console.log('Development mode: Loading Vite dev server at http://localhost:5173');
      this.mainWindow.loadURL('http://localhost:5173').catch((error) => {
        console.error('Failed to load Vite dev server:', error);
        console.log('Make sure npm run dev is running on port 5173');
      });
      this.mainWindow.webContents.openDevTools();
    } else {
      // プロダクションビルド時のHTMLファイルパス
      const rendererPath = path.join(__dirname, '../renderer/index.html');
      console.log('Loading renderer from:', rendererPath);
      this.mainWindow.loadFile(rendererPath);
    }
    
    // Window event handlers
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
    
    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });
  }
  
  private setupIPC() {
    setupFileHandlers();
    setupExportHandlers();
    
    // Basic app info
    ipcMain.handle('app:get-version', () => {
      return app.getVersion();
    });
    
    ipcMain.handle('app:get-path', (event, name: string) => {
      return app.getPath(name as any);
    });
    
    // GPU/システムメモリ情報取得ハンドラ
    ipcMain.handle('system:getMemoryInfo', async () => {
      try {
        const metrics = app.getAppMetrics();
        const gpuInfo = await app.getGPUInfo('complete');
        
        console.log('Total process metrics found:', metrics.length);
        
        // Debug: Log all available process types
        const processTypes = metrics.map(m => m.type);
        const uniqueTypes = [...new Set(processTypes)];
        console.log('Available process types:', uniqueTypes);
        console.log('Process type counts:', processTypes.reduce((acc, type) => {
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>));
        
        // Debug: Log detailed info for each process
        metrics.forEach((metric, index) => {
          console.log(`Process ${index}:`, {
            type: metric.type,
            pid: metric.pid,
            name: metric.name || 'N/A',
            memory: {
              workingSetSize: metric.memory.workingSetSize,
              privateBytes: metric.memory.privateBytes
            },
            cpu: metric.cpu
          });
        });
        
        // 各プロセスのメモリ情報を収集
        const processMemory = metrics.map(metric => ({
          type: metric.type,
          pid: metric.pid,
          name: metric.name || 'Unknown',
          memory: metric.memory,
          cpu: metric.cpu
        }));
        
        // GPU関連プロセスを複数の方法で探索
        const gpuProcess = processMemory.find(p => p.type === 'GPU');
        const gpuHelperProcess = processMemory.find(p => 
          p.type === 'GPU' || 
          p.type === 'Utility' && p.name?.includes('GPU') ||
          p.name?.toLowerCase().includes('gpu')
        );
        const utilityProcesses = processMemory.filter(p => p.type === 'Utility');
        
        console.log('GPU Process (type=GPU):', gpuProcess ? {
          pid: gpuProcess.pid,
          name: gpuProcess.name,
          memory: gpuProcess.memory
        } : 'Not found');
        
        console.log('GPU Helper Process (broader search):', gpuHelperProcess ? {
          pid: gpuHelperProcess.pid,
          name: gpuHelperProcess.name,
          type: gpuHelperProcess.type,
          memory: gpuHelperProcess.memory
        } : 'Not found');
        
        console.log('Utility processes found:', utilityProcesses.length);
        utilityProcesses.forEach((proc, i) => {
          console.log(`Utility ${i}:`, {
            pid: proc.pid,
            name: proc.name,
            memory: proc.memory
          });
        });
        
        // Debug: Check if GPU is enabled
        console.log('GPU Feature Status:', (gpuInfo as any)?.gpuDevice?.map((device: any) => ({
          vendorId: device.vendorId,
          deviceId: device.deviceId,
          description: device.description,
          revision: device.revision
        })));
        
        // Electronのwebフレームから追加情報取得
        const memoryInfo = await process.getProcessMemoryInfo();
        console.log('Main process memory info:', memoryInfo);
        
        // Try alternative methods to get GPU memory
        let gpuMemoryMB = 0;
        if (gpuProcess) {
          gpuMemoryMB = Math.round(gpuProcess.memory.workingSetSize / 1024);
          console.log('GPU memory from GPU process:', gpuMemoryMB, 'MB');
        } else if (gpuHelperProcess) {
          gpuMemoryMB = Math.round(gpuHelperProcess.memory.workingSetSize / 1024);
          console.log('GPU memory from GPU helper process:', gpuMemoryMB, 'MB');
        } else {
          console.log('No GPU process found - GPU might be disabled or not in use');
        }
        
        
        // GPUInfoを安全にシリアライズ（複雑なオブジェクトが原因でIPCエラー）
        const safeGpuInfo = {
          gpuDevice: (gpuInfo as any)?.gpuDevice?.map((device: any) => ({
            vendorId: device.vendorId,
            deviceId: device.deviceId,
            description: device.description || 'Unknown'
          })) || [],
          machineModelName: (gpuInfo as any)?.machineModelName || 'Unknown',
          machineModelVersion: (gpuInfo as any)?.machineModelVersion || 'Unknown'
        };

        // Process memoryも安全にシリアライズ
        const safeProcessMemory = processMemory.map(proc => ({
          type: proc.type,
          pid: proc.pid,
          name: proc.name || 'Unknown',
          memoryMB: Math.round(proc.memory.workingSetSize / 1024)
        }));

        return {
          processMemory: safeProcessMemory,
          gpuProcessMemory: gpuMemoryMB,
          gpuInfo: safeGpuInfo,
          totalMemory: {
            workingSetSize: Math.round((memoryInfo as any).workingSetSize / 1024), // MB
            privateBytes: Math.round((memoryInfo as any).privateBytes / 1024)     // MB
          },
          debug: {
            processTypes: uniqueTypes,
            gpuProcessExists: !!gpuProcess,
            gpuHelperProcessExists: !!gpuHelperProcess,
            utilityProcessCount: utilityProcesses.length,
            totalProcessCount: metrics.length
          }
        };
      } catch (error) {
        console.error('Failed to get memory info:', error);
        return {
          error: (error as Error).message,
          processMemory: [],
          gpuProcessMemory: 0,
          gpuInfo: null,
          totalMemory: null
        };
      }
    });

    // Additional debug handler for GPU process investigation
    ipcMain.handle('system:debugGPUProcesses', async () => {
      try {
        
        // Get system process information
        const metrics = app.getAppMetrics();
        
        // Alternative method: Check if hardware acceleration is enabled
        const featureList = app.getGPUFeatureStatus();
        console.log('GPU Feature Status:', featureList);
        
        // Check command line switches that might affect GPU
        const commandLine = process.argv;
        console.log('Command line arguments:', commandLine);
        
        // Check Chrome flags that might disable GPU
        const hasDisableGpu = commandLine.some(arg => 
          arg.includes('--disable-gpu') || 
          arg.includes('--disable-gpu-sandbox') ||
          arg.includes('--disable-software-rasterizer')
        );
        console.log('GPU disabling flags present:', hasDisableGpu);
        
        // Get detailed GPU info
        const gpuInfo = await app.getGPUInfo('complete');
        console.log('Complete GPU Info:', JSON.stringify(gpuInfo, null, 2));
        
        // Check for renderer processes (which might handle GPU work)
        const rendererProcesses = metrics.filter(m => m.type === 'Tab');
        console.log('Renderer processes:', rendererProcesses.length);
        
        // Look for any processes with GPU-related names or high memory usage
        const suspiciousProcesses = metrics.filter(m => 
          m.name?.toLowerCase().includes('gpu') ||
          m.name?.toLowerCase().includes('graphics') ||
          m.memory.workingSetSize > 50 * 1024 * 1024 // >50MB
        );
        console.log('Processes with GPU keywords or high memory:', suspiciousProcesses);
        
        // Platform-specific GPU process detection
        let platformSpecificInfo = {};
        if (process.platform === 'darwin') {
          // macOS specific
          platformSpecificInfo = {
            platform: 'macOS',
            note: 'GPU processes may be managed differently on macOS'
          };
        } else if (process.platform === 'win32') {
          // Windows specific
          platformSpecificInfo = {
            platform: 'Windows',
            note: 'GPU process should be visible as separate process'
          };
        }
        
        console.log('Platform info:', platformSpecificInfo);
        
        return {
          totalProcesses: metrics.length,
          featureList,
          hasDisableGpu,
          rendererProcessCount: rendererProcesses.length,
          suspiciousProcesses: suspiciousProcesses.map(p => ({
            type: p.type,
            name: p.name,
            pid: p.pid,
            memoryMB: Math.round(p.memory.workingSetSize / 1024 / 1024)
          })),
          platformInfo: platformSpecificInfo,
          commandLineArgs: commandLine,
          gpuInfo: gpuInfo
        };
      } catch (error) {
        console.error('GPU debug failed:', error);
        return { error: (error as Error).message };
      }
    });
  }
  
  private setupAppEvents() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
    
    // Security: Prevent new window creation
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        console.log('Prevented navigation to:', url);
        return { action: 'deny' };
      });
    });
  }
  
  getMainWindow(): BrowserWindowType | null {
    return this.mainWindow;
  }
}

// Initialize the application
const electronApp = new ElectronApp();
electronApp.initialize().catch(console.error);

// Export for use by other modules
export { electronApp };