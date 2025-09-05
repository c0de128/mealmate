import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger, performanceLogger } from './logger';
import { z } from 'zod';

const execAsync = promisify(exec);

// Backup configuration schema
const backupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.string().default('0 2 * * *'), // Daily at 2 AM
  retentionDays: z.number().min(1).max(365).default(30),
  backupPath: z.string().default('./backups'),
  compression: z.boolean().default(true),
  encryptionEnabled: z.boolean().default(false),
  encryptionKey: z.string().optional(),
  s3Upload: z.object({
    enabled: z.boolean().default(false),
    bucket: z.string().optional(),
    region: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional()
  }).default({})
});

export type BackupConfig = z.infer<typeof backupConfigSchema>;

export interface BackupResult {
  id: string;
  timestamp: Date;
  filename: string;
  filePath: string;
  size: number;
  compressed: boolean;
  encrypted: boolean;
  duration: number;
  checksum: string;
  status: 'success' | 'failed';
  error?: string;
  s3Upload?: {
    uploaded: boolean;
    key?: string;
    error?: string;
  };
}

export class BackupManager {
  private config: BackupConfig;
  private backupHistory: BackupResult[] = [];
  private isRunning = false;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = backupConfigSchema.parse(config);
    this.initializeBackupDirectory();
  }

  private async initializeBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupPath, { recursive: true });
      logger.info('Backup directory initialized', {
        path: this.config.backupPath
      });
    } catch (error) {
      logger.error('Failed to initialize backup directory', {
        path: this.config.backupPath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  public async createBackup(): Promise<BackupResult> {
    if (this.isRunning) {
      throw new Error('Backup is already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const backupId = this.generateBackupId();
    const timestamp = new Date();
    
    logger.info('Starting database backup', {
      backupId,
      timestamp: timestamp.toISOString()
    });

    try {
      // Generate backup filename
      const filename = this.generateBackupFilename(timestamp);
      const filePath = path.join(this.config.backupPath, filename);

      // Create database dump
      const dumpPath = await this.createDatabaseDump(filePath, backupId);
      
      // Get file size
      const stats = await fs.stat(dumpPath);
      let finalPath = dumpPath;
      let compressed = false;
      let encrypted = false;

      // Compress if enabled
      if (this.config.compression) {
        finalPath = await this.compressBackup(dumpPath, backupId);
        compressed = true;
        await fs.unlink(dumpPath); // Remove uncompressed file
      }

      // Encrypt if enabled
      if (this.config.encryptionEnabled && this.config.encryptionKey) {
        finalPath = await this.encryptBackup(finalPath, backupId);
        encrypted = true;
        if (compressed) {
          await fs.unlink(path.join(this.config.backupPath, `${filename}.gz`));
        } else {
          await fs.unlink(dumpPath);
        }
      }

      // Calculate checksum
      const checksum = await this.calculateChecksum(finalPath);

      const duration = Date.now() - startTime;
      const finalStats = await fs.stat(finalPath);

      const result: BackupResult = {
        id: backupId,
        timestamp,
        filename: path.basename(finalPath),
        filePath: finalPath,
        size: finalStats.size,
        compressed,
        encrypted,
        duration,
        checksum,
        status: 'success'
      };

      // Upload to S3 if configured
      if (this.config.s3Upload.enabled) {
        try {
          const s3Result = await this.uploadToS3(finalPath, path.basename(finalPath));
          result.s3Upload = s3Result;
        } catch (error) {
          result.s3Upload = {
            uploaded: false,
            error: error instanceof Error ? error.message : String(error)
          };
          logger.warn('S3 upload failed', {
            backupId,
            error: result.s3Upload.error
          });
        }
      }

      this.backupHistory.push(result);

      // Clean up old backups
      await this.cleanupOldBackups();

      logger.info('Database backup completed successfully', {
        backupId,
        filename: result.filename,
        size: result.size,
        duration: result.duration,
        compressed: result.compressed,
        encrypted: result.encrypted
      });

      performanceLogger.info('Backup performance metrics', {
        operation: 'database_backup',
        backupId,
        duration: result.duration,
        size: result.size,
        compressionRatio: compressed ? (stats.size / result.size).toFixed(2) : undefined
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const result: BackupResult = {
        id: backupId,
        timestamp,
        filename: '',
        filePath: '',
        size: 0,
        compressed: false,
        encrypted: false,
        duration,
        checksum: '',
        status: 'failed',
        error: errorMessage
      };

      this.backupHistory.push(result);

      logger.error('Database backup failed', {
        backupId,
        error: errorMessage,
        duration
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async createDatabaseDump(filePath: string, backupId: string): Promise<string> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Parse database URL
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    const host = url.hostname;
    const port = url.port || '5432';
    const username = url.username;
    const password = url.password;

    // Set environment variables for pg_dump
    const env = {
      ...process.env,
      PGPASSWORD: password
    };

    const command = `pg_dump -h ${host} -p ${port} -U ${username} -d ${dbName} --verbose --no-password --format=custom --file="${filePath}"`;

    logger.debug('Executing pg_dump command', {
      backupId,
      host,
      port,
      database: dbName,
      user: username
    });

    try {
      const { stdout, stderr } = await execAsync(command, { env, maxBuffer: 1024 * 1024 * 100 });
      
      if (stderr) {
        logger.debug('pg_dump stderr output', {
          backupId,
          stderr: stderr.substring(0, 1000) // Limit log size
        });
      }

      return filePath;
    } catch (error) {
      logger.error('pg_dump command failed', {
        backupId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Database dump failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async compressBackup(filePath: string, backupId: string): Promise<string> {
    const compressedPath = `${filePath}.gz`;
    const command = `gzip "${filePath}"`;

    logger.debug('Compressing backup', {
      backupId,
      originalPath: filePath,
      compressedPath
    });

    try {
      await execAsync(command);
      return compressedPath;
    } catch (error) {
      throw new Error(`Backup compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async encryptBackup(filePath: string, backupId: string): Promise<string> {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not provided');
    }

    const encryptedPath = `${filePath}.enc`;
    
    try {
      const data = await fs.readFile(filePath);
      const cipher = crypto.createCipher('aes-256-cbc', this.config.encryptionKey);
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      
      await fs.writeFile(encryptedPath, encrypted);
      
      logger.debug('Backup encrypted successfully', {
        backupId,
        originalPath: filePath,
        encryptedPath
      });

      return encryptedPath;
    } catch (error) {
      throw new Error(`Backup encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async uploadToS3(filePath: string, key: string): Promise<{ uploaded: boolean; key?: string; error?: string }> {
    // This would require AWS SDK implementation
    // For now, return a mock implementation
    logger.info('S3 upload would be implemented here', {
      filePath,
      key,
      bucket: this.config.s3Upload.bucket
    });

    return {
      uploaded: false,
      error: 'S3 upload not implemented - would require AWS SDK'
    };
  }

  private async cleanupOldBackups(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    logger.info('Starting backup cleanup', {
      retentionDays: this.config.retentionDays,
      cutoffDate: cutoffDate.toISOString()
    });

    try {
      const files = await fs.readdir(this.config.backupPath);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.config.backupPath, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          logger.debug('Deleted old backup file', {
            filename: file,
            age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24))
          });
        }
      }

      // Also clean up backup history
      this.backupHistory = this.backupHistory.filter(
        backup => backup.timestamp > cutoffDate
      );

      logger.info('Backup cleanup completed', {
        deletedFiles: deletedCount,
        remainingBackups: this.backupHistory.length
      });

    } catch (error) {
      logger.error('Backup cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  public async restoreBackup(backupPath: string, targetDatabase?: string): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const url = new URL(databaseUrl);
    const dbName = targetDatabase || url.pathname.slice(1);
    const host = url.hostname;
    const port = url.port || '5432';
    const username = url.username;
    const password = url.password;

    logger.info('Starting database restore', {
      backupPath,
      targetDatabase: dbName
    });

    try {
      // First, decrypt and decompress if needed
      let restorePath = backupPath;

      if (path.extname(backupPath) === '.enc') {
        if (!this.config.encryptionKey) {
          throw new Error('Encryption key required for encrypted backup');
        }
        restorePath = await this.decryptBackup(backupPath);
      }

      if (path.extname(restorePath) === '.gz') {
        restorePath = await this.decompressBackup(restorePath);
      }

      // Set environment variables for pg_restore
      const env = {
        ...process.env,
        PGPASSWORD: password
      };

      const command = `pg_restore -h ${host} -p ${port} -U ${username} -d ${dbName} --verbose --clean --if-exists "${restorePath}"`;

      const { stdout, stderr } = await execAsync(command, { env });

      if (stderr) {
        logger.debug('pg_restore stderr output', {
          stderr: stderr.substring(0, 1000)
        });
      }

      logger.info('Database restore completed successfully', {
        backupPath,
        targetDatabase: dbName
      });

    } catch (error) {
      logger.error('Database restore failed', {
        backupPath,
        targetDatabase: dbName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async decryptBackup(encryptedPath: string): Promise<string> {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not provided');
    }

    const decryptedPath = encryptedPath.replace('.enc', '');
    
    try {
      const encryptedData = await fs.readFile(encryptedPath);
      const decipher = crypto.createDecipher('aes-256-cbc', this.config.encryptionKey);
      const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      
      await fs.writeFile(decryptedPath, decrypted);
      return decryptedPath;
    } catch (error) {
      throw new Error(`Backup decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async decompressBackup(compressedPath: string): Promise<string> {
    const decompressedPath = compressedPath.replace('.gz', '');
    const command = `gunzip -c "${compressedPath}" > "${decompressedPath}"`;

    try {
      await execAsync(command);
      return decompressedPath;
    } catch (error) {
      throw new Error(`Backup decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public getBackupHistory(): BackupResult[] {
    return [...this.backupHistory];
  }

  public getBackupStats(): {
    totalBackups: number;
    successfulBackups: number;
    failedBackups: number;
    totalSize: number;
    oldestBackup?: Date;
    newestBackup?: Date;
    averageDuration: number;
  } {
    const successful = this.backupHistory.filter(b => b.status === 'success');
    const failed = this.backupHistory.filter(b => b.status === 'failed');

    return {
      totalBackups: this.backupHistory.length,
      successfulBackups: successful.length,
      failedBackups: failed.length,
      totalSize: successful.reduce((sum, b) => sum + b.size, 0),
      oldestBackup: this.backupHistory.length > 0 ? 
        new Date(Math.min(...this.backupHistory.map(b => b.timestamp.getTime()))) : undefined,
      newestBackup: this.backupHistory.length > 0 ? 
        new Date(Math.max(...this.backupHistory.map(b => b.timestamp.getTime()))) : undefined,
      averageDuration: successful.length > 0 ? 
        successful.reduce((sum, b) => sum + b.duration, 0) / successful.length : 0
    };
  }

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateBackupFilename(timestamp: Date): string {
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `mealmate_backup_${dateStr}_${timeStr}.dump`;
  }

  public updateConfig(newConfig: Partial<BackupConfig>): void {
    this.config = backupConfigSchema.parse({ ...this.config, ...newConfig });
    logger.info('Backup configuration updated', this.config);
  }

  public getConfig(): BackupConfig {
    return { ...this.config };
  }

  public isBackupRunning(): boolean {
    return this.isRunning;
  }
}

// Global backup manager instance
export const backupManager = new BackupManager({
  enabled: process.env.BACKUP_ENABLED !== 'false',
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
  backupPath: process.env.BACKUP_PATH || './backups',
  compression: process.env.BACKUP_COMPRESSION !== 'false',
  encryptionEnabled: process.env.BACKUP_ENCRYPTION === 'true',
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
  s3Upload: {
    enabled: process.env.BACKUP_S3_ENABLED === 'true',
    bucket: process.env.BACKUP_S3_BUCKET,
    region: process.env.BACKUP_S3_REGION,
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY
  }
});

// Scheduler for automated backups
export class BackupScheduler {
  private intervals: NodeJS.Timeout[] = [];

  public start(): void {
    this.stop(); // Clear any existing intervals

    const config = backupManager.getConfig();
    if (!config.enabled) {
      logger.info('Backup scheduler disabled');
      return;
    }

    // For simplicity, we'll implement a basic daily backup
    // In production, you'd want to use a proper cron library
    const dailyBackup = setInterval(async () => {
      try {
        await backupManager.createBackup();
      } catch (error) {
        logger.error('Scheduled backup failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    this.intervals.push(dailyBackup);

    logger.info('Backup scheduler started', {
      schedule: config.schedule,
      enabled: config.enabled
    });
  }

  public stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    logger.info('Backup scheduler stopped');
  }
}

export const backupScheduler = new BackupScheduler();