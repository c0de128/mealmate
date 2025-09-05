import { Request, Response } from 'express';
import { logger, performanceLogger } from './logger';
import { backupManager, backupScheduler, type BackupConfig } from './backup-system';
import { NotFoundError, ValidationError, asyncHandler } from './error-handler';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';

// API schemas
const createBackupSchema = z.object({
  compression: z.boolean().optional(),
  encryption: z.boolean().optional()
});

const restoreBackupSchema = z.object({
  backupId: z.string().optional(),
  backupPath: z.string().optional(),
  targetDatabase: z.string().optional()
});

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  compression: z.boolean().optional(),
  encryptionEnabled: z.boolean().optional(),
  encryptionKey: z.string().optional(),
  s3Upload: z.object({
    enabled: z.boolean().optional(),
    bucket: z.string().optional(),
    region: z.string().optional()
  }).optional()
});

// Create manual backup
export const createManualBackup = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const body = createBackupSchema.parse(req.body);

    // Temporarily update config for this backup if options provided
    const originalConfig = backupManager.getConfig();
    if (body.compression !== undefined || body.encryption !== undefined) {
      const tempConfig: Partial<BackupConfig> = {};
      if (body.compression !== undefined) tempConfig.compression = body.compression;
      if (body.encryption !== undefined) tempConfig.encryptionEnabled = body.encryption;
      
      backupManager.updateConfig(tempConfig);
    }

    logger.info('Manual backup initiated', {
      requestedBy: 'api',
      compression: body.compression,
      encryption: body.encryption
    });

    const result = await backupManager.createBackup();

    // Restore original config
    if (body.compression !== undefined || body.encryption !== undefined) {
      backupManager.updateConfig(originalConfig);
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Manual backup API completed', {
      operation: 'manual_backup',
      backupId: result.id,
      responseTime,
      success: result.status === 'success'
    });

    res.status(201).json({
      message: 'Backup created successfully',
      backup: {
        id: result.id,
        filename: result.filename,
        size: result.size,
        compressed: result.compressed,
        encrypted: result.encrypted,
        duration: result.duration,
        checksum: result.checksum,
        timestamp: result.timestamp.toISOString()
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    performanceLogger.info('Manual backup API failed', {
      operation: 'manual_backup',
      responseTime,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid backup request: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Get backup history
export const getBackupHistory = asyncHandler(async (req: Request, res: Response) => {
  const { limit = '20', offset = '0', status } = req.query;

  const limitNum = Math.min(parseInt(limit as string) || 20, 100);
  const offsetNum = parseInt(offset as string) || 0;

  let history = backupManager.getBackupHistory();

  // Filter by status if provided
  if (status && (status === 'success' || status === 'failed')) {
    history = history.filter(backup => backup.status === status);
  }

  // Sort by timestamp (newest first)
  history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply pagination
  const paginatedHistory = history.slice(offsetNum, offsetNum + limitNum);

  // Format response
  const formattedHistory = paginatedHistory.map(backup => ({
    id: backup.id,
    filename: backup.filename,
    size: backup.size,
    compressed: backup.compressed,
    encrypted: backup.encrypted,
    duration: backup.duration,
    checksum: backup.checksum,
    status: backup.status,
    error: backup.error,
    timestamp: backup.timestamp.toISOString(),
    s3Upload: backup.s3Upload
  }));

  res.json({
    backups: formattedHistory,
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: history.length,
      hasMore: offsetNum + limitNum < history.length
    }
  });
});

// Get backup statistics
export const getBackupStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = backupManager.getBackupStats();

  res.json({
    statistics: {
      ...stats,
      oldestBackup: stats.oldestBackup?.toISOString(),
      newestBackup: stats.newestBackup?.toISOString(),
      averageDurationMinutes: Math.round(stats.averageDuration / 60000 * 100) / 100,
      totalSizeMB: Math.round(stats.totalSize / (1024 * 1024) * 100) / 100
    },
    config: {
      enabled: backupManager.getConfig().enabled,
      retentionDays: backupManager.getConfig().retentionDays,
      compression: backupManager.getConfig().compression,
      encryptionEnabled: backupManager.getConfig().encryptionEnabled,
      s3Enabled: backupManager.getConfig().s3Upload.enabled
    },
    status: {
      isRunning: backupManager.isBackupRunning(),
      schedulerActive: true // We'd track this properly in production
    }
  });
});

// Download backup file
export const downloadBackup = asyncHandler(async (req: Request, res: Response) => {
  const { backupId } = req.params;

  if (!backupId) {
    throw new ValidationError('Backup ID is required');
  }

  const history = backupManager.getBackupHistory();
  const backup = history.find(b => b.id === backupId);

  if (!backup) {
    throw new NotFoundError('Backup', backupId);
  }

  if (backup.status !== 'success') {
    throw new ValidationError('Cannot download failed backup');
  }

  try {
    // Check if file exists
    await fs.access(backup.filePath);

    logger.info('Backup download initiated', {
      backupId,
      filename: backup.filename,
      size: backup.size
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    res.setHeader('Content-Length', backup.size.toString());

    // Stream the file
    const stream = require('fs').createReadStream(backup.filePath);
    stream.pipe(res);

    stream.on('end', () => {
      logger.info('Backup download completed', {
        backupId,
        filename: backup.filename
      });
    });

    stream.on('error', (error: Error) => {
      logger.error('Backup download failed', {
        backupId,
        filename: backup.filename,
        error: error.message
      });
      if (!res.headersSent) {
        res.status(500).json({ message: 'Download failed' });
      }
    });

  } catch (error) {
    logger.error('Backup file not found', {
      backupId,
      filePath: backup.filePath
    });
    throw new NotFoundError('Backup file', backup.filePath);
  }
});

// Delete backup
export const deleteBackup = asyncHandler(async (req: Request, res: Response) => {
  const { backupId } = req.params;

  if (!backupId) {
    throw new ValidationError('Backup ID is required');
  }

  const history = backupManager.getBackupHistory();
  const backup = history.find(b => b.id === backupId);

  if (!backup) {
    throw new NotFoundError('Backup', backupId);
  }

  try {
    // Delete the backup file
    await fs.unlink(backup.filePath);

    // Remove from history (in production, you'd update a database)
    const index = history.indexOf(backup);
    if (index > -1) {
      history.splice(index, 1);
    }

    logger.info('Backup deleted successfully', {
      backupId,
      filename: backup.filename
    });

    res.json({
      message: 'Backup deleted successfully',
      backupId
    });

  } catch (error) {
    logger.error('Failed to delete backup', {
      backupId,
      filePath: backup.filePath,
      error: error instanceof Error ? error.message : String(error)
    });

    if ((error as any).code === 'ENOENT') {
      // File doesn't exist, remove from history anyway
      const index = history.indexOf(backup);
      if (index > -1) {
        history.splice(index, 1);
      }
      return res.json({
        message: 'Backup file was already deleted, removed from history',
        backupId
      });
    }

    throw error;
  }
});

// Restore from backup
export const restoreFromBackup = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { backupId, backupPath, targetDatabase } = restoreBackupSchema.parse(req.body);

    let restorePath: string;

    if (backupId) {
      // Find backup by ID
      const history = backupManager.getBackupHistory();
      const backup = history.find(b => b.id === backupId);

      if (!backup) {
        throw new NotFoundError('Backup', backupId);
      }

      if (backup.status !== 'success') {
        throw new ValidationError('Cannot restore from failed backup');
      }

      restorePath = backup.filePath;
    } else if (backupPath) {
      // Use provided path
      restorePath = backupPath;
    } else {
      throw new ValidationError('Either backupId or backupPath must be provided');
    }

    logger.info('Database restore initiated', {
      backupId,
      backupPath: restorePath,
      targetDatabase: targetDatabase || 'default'
    });

    await backupManager.restoreBackup(restorePath, targetDatabase);

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Database restore completed', {
      operation: 'database_restore',
      backupId,
      targetDatabase,
      responseTime
    });

    res.json({
      message: 'Database restored successfully',
      backupId,
      targetDatabase: targetDatabase || 'default',
      duration: responseTime
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    performanceLogger.info('Database restore failed', {
      operation: 'database_restore',
      responseTime,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid restore request: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Update backup configuration
export const updateBackupConfig = asyncHandler(async (req: Request, res: Response) => {
  try {
    const updates = updateConfigSchema.parse(req.body);

    const currentConfig = backupManager.getConfig();
    backupManager.updateConfig(updates);
    const newConfig = backupManager.getConfig();

    // Restart scheduler if enabled status changed
    if (updates.enabled !== undefined && updates.enabled !== currentConfig.enabled) {
      if (updates.enabled) {
        backupScheduler.start();
      } else {
        backupScheduler.stop();
      }
    }

    logger.info('Backup configuration updated', {
      changes: updates,
      newConfig: {
        enabled: newConfig.enabled,
        retentionDays: newConfig.retentionDays,
        compression: newConfig.compression,
        encryptionEnabled: newConfig.encryptionEnabled
      }
    });

    res.json({
      message: 'Backup configuration updated successfully',
      config: {
        enabled: newConfig.enabled,
        retentionDays: newConfig.retentionDays,
        compression: newConfig.compression,
        encryptionEnabled: newConfig.encryptionEnabled,
        s3Enabled: newConfig.s3Upload.enabled
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid configuration: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Get backup configuration
export const getBackupConfig = asyncHandler(async (req: Request, res: Response) => {
  const config = backupManager.getConfig();

  res.json({
    config: {
      enabled: config.enabled,
      schedule: config.schedule,
      retentionDays: config.retentionDays,
      compression: config.compression,
      encryptionEnabled: config.encryptionEnabled,
      s3Upload: {
        enabled: config.s3Upload.enabled,
        bucket: config.s3Upload.bucket,
        region: config.s3Upload.region
      }
    },
    status: {
      isRunning: backupManager.isBackupRunning(),
      schedulerActive: true // Track this properly in production
    }
  });
});