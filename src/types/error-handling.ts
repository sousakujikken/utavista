/**
 * 統一エラーハンドリングシステム
 */

/**
 * アプリケーションエラーの基底クラス
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    code: string,
    context?: Record<string, any>,
    recoverable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    
    // スタックトレースを適切に設定
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * エラー情報をJSON形式で取得
   */
  toJSON(): ErrorInfo {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      stack: this.stack
    };
  }
}

/**
 * データバリデーションエラー
 */
export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly value?: any;

  constructor(
    message: string,
    field?: string,
    value?: any,
    context?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', { field, value, ...context }, true);
    this.field = field;
    this.value = value;
  }
}

/**
 * データ復元エラー
 */
export class RestoreError extends AppError {
  public readonly step?: string;
  public readonly partialData?: any;

  constructor(
    message: string,
    step?: string,
    partialData?: any,
    context?: Record<string, any>
  ) {
    super(message, 'RESTORE_ERROR', { step, partialData, ...context }, false);
    this.step = step;
    this.partialData = partialData;
  }
}

/**
 * データ保存エラー
 */
export class SaveError extends AppError {
  public readonly filePath?: string;
  public readonly operation?: string;

  constructor(
    message: string,
    filePath?: string,
    operation?: string,
    context?: Record<string, any>
  ) {
    super(message, 'SAVE_ERROR', { filePath, operation, ...context }, true);
    this.filePath = filePath;
    this.operation = operation;
  }
}

/**
 * テンプレート関連エラー
 */
export class TemplateError extends AppError {
  public readonly templateId?: string;
  public readonly objectId?: string;

  constructor(
    message: string,
    templateId?: string,
    objectId?: string,
    context?: Record<string, any>
  ) {
    super(message, 'TEMPLATE_ERROR', { templateId, objectId, ...context }, true);
    this.templateId = templateId;
    this.objectId = objectId;
  }
}

/**
 * パラメータ関連エラー
 */
export class ParameterError extends AppError {
  public readonly parameterName?: string;
  public readonly parameterValue?: any;

  constructor(
    message: string,
    parameterName?: string,
    parameterValue?: any,
    context?: Record<string, any>
  ) {
    super(message, 'PARAMETER_ERROR', { parameterName, parameterValue, ...context }, true);
    this.parameterName = parameterName;
    this.parameterValue = parameterValue;
  }
}

/**
 * ファイルシステムエラー
 */
export class FileSystemError extends AppError {
  public readonly path?: string;
  public readonly operation?: string;
  public readonly systemError?: Error;

  constructor(
    message: string,
    path?: string,
    operation?: string,
    systemError?: Error,
    context?: Record<string, any>
  ) {
    super(message, 'FILESYSTEM_ERROR', { path, operation, systemError: systemError?.message, ...context }, true);
    this.path = path;
    this.operation = operation;
    this.systemError = systemError;
  }
}

/**
 * エラー情報インターフェース
 */
export interface ErrorInfo {
  name: string;
  message: string;
  code: string;
  context?: Record<string, any>;
  timestamp: string;
  recoverable: boolean;
  stack?: string;
}

/**
 * Result型（エラーハンドリング用）
 */
export type Result<T, E = AppError> = Success<T> | Failure<E>;

/**
 * 成功結果
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * 失敗結果
 */
export interface Failure<E> {
  success: false;
  error: E;
}

/**
 * Resultユーティリティ関数
 */
export class ResultUtils {
  /**
   * 成功結果を作成
   */
  static success<T>(data: T): Success<T> {
    return { success: true, data };
  }

  /**
   * 失敗結果を作成
   */
  static failure<E extends AppError>(error: E): Failure<E> {
    return { success: false, error };
  }

  /**
   * 非同期処理をResult型でラップ
   */
  static async wrap<T>(
    promise: Promise<T>,
    errorTransform?: (error: any) => AppError
  ): Promise<Result<T>> {
    try {
      const data = await promise;
      return ResultUtils.success(data);
    } catch (error) {
      const appError = errorTransform 
        ? errorTransform(error)
        : error instanceof AppError 
          ? error 
          : new AppError(
              'Unexpected error occurred',
              'UNKNOWN_ERROR',
              { originalError: error?.toString() }
            );
      return ResultUtils.failure(appError);
    }
  }

  /**
   * 同期処理をResult型でラップ
   */
  static try<T>(
    fn: () => T,
    errorTransform?: (error: any) => AppError
  ): Result<T> {
    try {
      const data = fn();
      return ResultUtils.success(data);
    } catch (error) {
      const appError = errorTransform 
        ? errorTransform(error)
        : error instanceof AppError 
          ? error 
          : new AppError(
              'Unexpected error occurred',
              'UNKNOWN_ERROR',
              { originalError: error?.toString() }
            );
      return ResultUtils.failure(appError);
    }
  }
}

/**
 * エラーレポーター
 */
export interface ErrorReporter {
  report(error: AppError): void;
  reportWithContext(error: AppError, additionalContext: Record<string, any>): void;
}

/**
 * コンソールエラーレポーター
 */
export class ConsoleErrorReporter implements ErrorReporter {
  report(error: AppError): void {
    console.error('[ERROR]', {
      name: error.name,
      message: error.message,
      code: error.code,
      context: error.context,
      timestamp: error.timestamp,
      recoverable: error.recoverable
    });
    
    if (error.stack) {
      console.error('[STACK]', error.stack);
    }
  }

  reportWithContext(error: AppError, additionalContext: Record<string, any>): void {
    const enhancedError = new (error.constructor as any)(
      error.message,
      error.code,
      { ...error.context, ...additionalContext },
      error.recoverable
    );
    this.report(enhancedError);
  }
}

/**
 * グローバルエラーハンドラー
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private reporters: ErrorReporter[] = [];

  private constructor() {
    // デフォルトレポーターを追加
    this.addReporter(new ConsoleErrorReporter());
  }

  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  addReporter(reporter: ErrorReporter): void {
    this.reporters.push(reporter);
  }

  removeReporter(reporter: ErrorReporter): void {
    const index = this.reporters.indexOf(reporter);
    if (index >= 0) {
      this.reporters.splice(index, 1);
    }
  }

  handle(error: AppError, context?: Record<string, any>): void {
    this.reporters.forEach(reporter => {
      if (context) {
        reporter.reportWithContext(error, context);
      } else {
        reporter.report(error);
      }
    });
  }
}

/**
 * エラーハンドリングヘルパー関数
 */
export function handleError(error: any, context?: Record<string, any>): AppError {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Error) {
    appError = new AppError(
      error.message,
      'WRAPPED_ERROR',
      { originalName: error.name, ...context }
    );
  } else {
    appError = new AppError(
      'Unknown error occurred',
      'UNKNOWN_ERROR',
      { originalError: String(error), ...context }
    );
  }

  GlobalErrorHandler.getInstance().handle(appError, context);
  return appError;
}