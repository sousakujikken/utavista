/**
 * Improved Template Validation Schema - Critical Issues Fixed
 * 
 * Fixes identified by senior engineer review:
 * 1. Memory leak prevention in PIXI container usage
 * 2. Alignment with optional interface methods
 * 3. Scalable validation approach
 * 4. Type safety improvements
 */

import { IAnimationTemplate, ParameterConfig, HierarchyType, AnimationPhase } from '../../types/types';
import * as PIXI from 'pixi.js';

/**
 * Validation result for a single template
 */
export interface TemplateValidationResult {
  templateId: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    isClass: boolean;
    canInstantiate: boolean;
    hasRenderMethods: boolean;
    hasParameterConfig: boolean;
    runtimeTest: boolean;
  };
}

/**
 * Summary of all template validations
 */
export interface ValidationSummary {
  totalTemplates: number;
  validTemplates: number;
  invalidTemplates: number;
  results: TemplateValidationResult[];
  overallValid: boolean;
}

/**
 * Shared PIXI Application for testing (memory efficient)
 */
class SharedTestEnvironment {
  private static instance: SharedTestEnvironment;
  private pixiApp: PIXI.Application | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): SharedTestEnvironment {
    if (!SharedTestEnvironment.instance) {
      SharedTestEnvironment.instance = new SharedTestEnvironment();
    }
    return SharedTestEnvironment.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create minimal headless PIXI application for testing
      this.pixiApp = new PIXI.Application({
        width: 100,
        height: 100,
        backgroundAlpha: 0,
        preference: 'webgl'
      });
      
      this.initialized = true;
      console.log('[TestEnvironment] Initialized shared PIXI environment');
    } catch (error) {
      console.warn('[TestEnvironment] Failed to initialize PIXI, skipping render tests:', error);
      this.initialized = false;
    }
  }

  createTestContainer(): PIXI.Container {
    return new PIXI.Container();
  }

  cleanup(): void {
    if (this.pixiApp) {
      this.pixiApp.destroy(true);
      this.pixiApp = null;
    }
    this.initialized = false;
    console.log('[TestEnvironment] Cleaned up shared PIXI environment');
  }

  isAvailable(): boolean {
    return this.initialized && this.pixiApp !== null;
  }
}

/**
 * Improved template validator class
 */
export class ImprovedTemplateValidator {
  private static testEnv = SharedTestEnvironment.getInstance();

  /**
   * Validate that an export is a proper class constructor
   */
  static validateIsClass(templateId: string, TemplateExport: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if it's a function (class constructor)
    if (typeof TemplateExport !== 'function') {
      errors.push(
        `Template must be exported as a class, not as ${typeof TemplateExport}. ` +
        `Convert from object literal or instance export to class export.`
      );
      return { isValid: false, errors };
    }

    // Check if it has a prototype (is a class/constructor function)
    if (!TemplateExport.prototype) {
      errors.push(
        `Export is not a valid class constructor. ` +
        `Ensure you're exporting the class itself, not an instance.`
      );
      return { isValid: false, errors };
    }

    // Check if it's a proper constructor (has constructor property)
    if (!TemplateExport.prototype.constructor) {
      errors.push(`Class constructor is malformed.`);
      return { isValid: false, errors };
    }

    return { isValid: true, errors: [] };
  }

  /**
   * Validate that a template can be instantiated
   */
  static validateCanInstantiate(templateId: string, TemplateClass: new () => IAnimationTemplate): {
    isValid: boolean;
    errors: string[];
    instance?: IAnimationTemplate;
  } {
    const errors: string[] = [];

    try {
      const instance = new TemplateClass();
      return { isValid: true, errors: [], instance };
    } catch (error) {
      errors.push(
        `Failed to instantiate template: ${error instanceof Error ? error.message : String(error)}. ` +
        `Ensure the class constructor doesn't require parameters.`
      );
      return { isValid: false, errors };
    }
  }

  /**
   * Validate that a template instance has render methods
   * Fixed: Now aligns with optional interface methods
   */
  static validateRenderMethods(templateId: string, template: IAnimationTemplate): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for at least one render method (all are optional per interface)
    const renderMethods = [
      'animateContainer',
      'renderPhraseContainer',
      'renderWordContainer', 
      'renderCharContainer'
    ] as const;

    const implementedMethods = renderMethods.filter(method => 
      typeof template[method] === 'function'
    );

    if (implementedMethods.length === 0) {
      errors.push(
        'Template must implement at least one render method: ' +
        'animateContainer, renderPhraseContainer, renderWordContainer, or renderCharContainer'
      );
    }

    // Check for removeVisualElements (highly recommended)
    if (typeof template.removeVisualElements !== 'function') {
      warnings.push(
        'removeVisualElements method not implemented - may cause memory leaks'
      );
    }

    // Legacy method compatibility check
    if (typeof (template as any).animate === 'function') {
      warnings.push(
        'Legacy animate method detected - consider migrating to hierarchical render methods'
      );
    }

    return { 
      isValid: implementedMethods.length > 0, 
      errors, 
      warnings 
    };
  }

  /**
   * Validate parameter configuration
   * Fixed: Handles optional getParameterConfig gracefully
   */
  static validateParameterConfig(templateId: string, template: IAnimationTemplate): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // getParameterConfig is optional per interface
    if (typeof template.getParameterConfig !== 'function') {
      warnings.push('getParameterConfig method not implemented - template will have no configurable parameters');
      return { isValid: true, errors: [], warnings };
    }

    let config: ParameterConfig[];
    try {
      config = template.getParameterConfig();
    } catch (error) {
      errors.push(
        `getParameterConfig() threw an error: ${error instanceof Error ? error.message : String(error)}`
      );
      return { isValid: false, errors, warnings };
    }

    if (!Array.isArray(config)) {
      errors.push('getParameterConfig() must return an array');
      return { isValid: false, errors, warnings };
    }

    // Validate each parameter config with improved error reporting
    for (let i = 0; i < config.length; i++) {
      const param = config[i];
      const paramContext = `Parameter ${i}${param?.name ? ` (${param.name})` : ' (unnamed)'}`;

      if (!param || typeof param !== 'object') {
        errors.push(`${paramContext}: must be a valid parameter configuration object`);
        continue;
      }

      if (!param.name || typeof param.name !== 'string') {
        errors.push(`${paramContext}: must have a valid string name`);
      }

      if (!param.type || typeof param.type !== 'string') {
        errors.push(`${paramContext}: must have a valid string type`);
      }

      if (param.default === undefined) {
        warnings.push(`${paramContext}: no default value specified`);
      }

      // Type-specific validations with better error messages
      this.validateParameterType(param, paramContext, errors, warnings);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate parameter type-specific constraints
   */
  private static validateParameterType(
    param: ParameterConfig, 
    context: string, 
    errors: string[], 
    warnings: string[]
  ): void {
    switch (param.type) {
      case 'number':
        if (param.default !== undefined && typeof param.default !== 'number') {
          errors.push(`${context}: number type must have numeric default value`);
        }
        if (param.min !== undefined && typeof param.min !== 'number') {
          errors.push(`${context}: min value must be a number`);
        }
        if (param.max !== undefined && typeof param.max !== 'number') {
          errors.push(`${context}: max value must be a number`);
        }
        if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
          errors.push(`${context}: min value (${param.min}) cannot be greater than max value (${param.max})`);
        }
        break;

      case 'boolean':
        if (param.default !== undefined && typeof param.default !== 'boolean') {
          errors.push(`${context}: boolean type must have boolean default value`);
        }
        break;

      case 'string':
      case 'font':
      case 'color':
        if (param.default !== undefined && typeof param.default !== 'string') {
          errors.push(`${context}: ${param.type} type must have string default value`);
        }
        break;

      case 'select':
        if (!param.options || !Array.isArray(param.options)) {
          errors.push(`${context}: select type must have options array`);
        } else if (param.options.length === 0) {
          warnings.push(`${context}: select type has empty options array`);
        }
        break;

      default:
        warnings.push(`${context}: unknown parameter type '${param.type}'`);
    }
  }

  /**
   * Perform safe runtime test of template methods
   * Fixed: Prevents memory leaks and handles optional methods
   */
  static async validateRuntimeBehavior(templateId: string, template: IAnimationTemplate): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Skip runtime tests if PIXI environment is not available
    if (!this.testEnv.isAvailable()) {
      await this.testEnv.initialize();
      if (!this.testEnv.isAvailable()) {
        warnings.push('PIXI environment not available - skipping runtime tests');
        return { isValid: true, errors, warnings };
      }
    }

    let testContainer: PIXI.Container | null = null;

    try {
      // Create test environment
      testContainer = this.testEnv.createTestContainer();
      const testParams = { fontSize: 24, textColor: '#FFFFFF' };
      const nowMs = 1000;
      const startMs = 0;
      const endMs = 2000;
      const phase = AnimationPhase.Active;
      const hierarchyType = HierarchyType.Character;

      // Test animateContainer if available
      if (typeof template.animateContainer === 'function') {
        try {
          const result = template.animateContainer(
            testContainer,
            'test',
            testParams,
            nowMs,
            startMs,
            endMs,
            phase,
            hierarchyType
          );
          if (typeof result !== 'boolean') {
            warnings.push('animateContainer should return a boolean');
          }
        } catch (error) {
          errors.push(`animateContainer runtime error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Test renderCharContainer if available (most critical)
      if (typeof template.renderCharContainer === 'function') {
        try {
          const result = template.renderCharContainer(
            testContainer,
            'A',
            testParams,
            nowMs,
            startMs,
            endMs,
            phase,
            hierarchyType
          );
          if (typeof result !== 'boolean') {
            warnings.push('renderCharContainer should return a boolean');
          }
        } catch (error) {
          errors.push(`renderCharContainer runtime error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Test removeVisualElements if available
      if (typeof template.removeVisualElements === 'function') {
        try {
          template.removeVisualElements(testContainer);
        } catch (error) {
          errors.push(`removeVisualElements runtime error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

    } catch (error) {
      errors.push(
        `Runtime test setup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Always clean up test container
      if (testContainer) {
        testContainer.destroy({ children: true, texture: false, baseTexture: false });
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Perform comprehensive validation of a template class
   * Fixed: Uses improved validation methods
   */
  static async validateTemplate(templateId: string, TemplateExport: any): Promise<TemplateValidationResult> {
    const result: TemplateValidationResult = {
      templateId,
      isValid: false,
      errors: [],
      warnings: [],
      details: {
        isClass: false,
        canInstantiate: false,
        hasRenderMethods: false,
        hasParameterConfig: false,
        runtimeTest: false
      }
    };

    // Step 1: Validate it's a class
    const classValidation = this.validateIsClass(templateId, TemplateExport);
    result.details.isClass = classValidation.isValid;
    result.errors.push(...classValidation.errors);

    if (!classValidation.isValid) {
      return result; // Early exit if not a class
    }

    // Step 2: Validate can instantiate
    const instantiationValidation = this.validateCanInstantiate(templateId, TemplateExport);
    result.details.canInstantiate = instantiationValidation.isValid;
    result.errors.push(...instantiationValidation.errors);

    if (!instantiationValidation.isValid || !instantiationValidation.instance) {
      return result; // Early exit if can't instantiate
    }

    const template = instantiationValidation.instance;

    // Step 3: Validate render methods
    const methodValidation = this.validateRenderMethods(templateId, template);
    result.details.hasRenderMethods = methodValidation.isValid;
    result.errors.push(...methodValidation.errors);
    result.warnings.push(...methodValidation.warnings);

    // Step 4: Validate parameter configuration
    const paramValidation = this.validateParameterConfig(templateId, template);
    result.details.hasParameterConfig = paramValidation.isValid;
    result.errors.push(...paramValidation.errors);
    result.warnings.push(...paramValidation.warnings);

    // Step 5: Runtime behavior test (async)
    const runtimeValidation = await this.validateRuntimeBehavior(templateId, template);
    result.details.runtimeTest = runtimeValidation.isValid;
    result.errors.push(...runtimeValidation.errors);
    result.warnings.push(...runtimeValidation.warnings);

    // Overall validation
    result.isValid = result.details.isClass && 
                    result.details.canInstantiate && 
                    result.details.hasRenderMethods && 
                    result.details.hasParameterConfig && 
                    result.details.runtimeTest;

    return result;
  }

  /**
   * Validate multiple templates with improved error handling
   */
  static async validateTemplates(templates: Record<string, any>): Promise<ValidationSummary> {
    // Initialize shared test environment once
    await this.testEnv.initialize();

    const results: TemplateValidationResult[] = [];

    for (const [templateId, TemplateExport] of Object.entries(templates)) {
      try {
        const result = await this.validateTemplate(templateId, TemplateExport);
        results.push(result);
      } catch (error) {
        // Handle unexpected validation errors
        results.push({
          templateId,
          isValid: false,
          errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
          warnings: [],
          details: {
            isClass: false,
            canInstantiate: false,
            hasRenderMethods: false,
            hasParameterConfig: false,
            runtimeTest: false
          }
        });
      }
    }

    // Clean up shared test environment
    this.testEnv.cleanup();

    const validTemplates = results.filter(r => r.isValid).length;
    const invalidTemplates = results.length - validTemplates;

    return {
      totalTemplates: results.length,
      validTemplates,
      invalidTemplates,
      results,
      overallValid: invalidTemplates === 0
    };
  }
}

/**
 * Improved validation reporter with better formatting
 */
export class ImprovedValidationReporter {
  /**
   * Generate a detailed validation report
   */
  static generateReport(summary: ValidationSummary): string {
    const lines: string[] = [];

    lines.push('=== IMPROVED TEMPLATE VALIDATION REPORT ===');
    lines.push(`Total Templates: ${summary.totalTemplates}`);
    lines.push(`Valid Templates: ${summary.validTemplates}`);
    lines.push(`Invalid Templates: ${summary.invalidTemplates}`);
    lines.push(`Overall Status: ${summary.overallValid ? '✅ PASS' : '❌ FAIL'}`);
    lines.push('');

    // Group results by status
    const validResults = summary.results.filter(r => r.isValid);
    const invalidResults = summary.results.filter(r => !r.isValid);

    if (validResults.length > 0) {
      lines.push('✅ VALID TEMPLATES:');
      validResults.forEach(result => {
        lines.push(`  • ${result.templateId}`);
        if (result.warnings.length > 0) {
          lines.push(`    Warnings: ${result.warnings.length}`);
        }
      });
      lines.push('');
    }

    if (invalidResults.length > 0) {
      lines.push('❌ INVALID TEMPLATES:');
      invalidResults.forEach(result => {
        lines.push(`  • ${result.templateId}`);
        
        if (result.errors.length > 0) {
          lines.push('    Errors:');
          result.errors.forEach(error => lines.push(`      - ${error}`));
        }

        if (result.warnings.length > 0) {
          lines.push('    Warnings:');
          result.warnings.forEach(warning => lines.push(`      - ${warning}`));
        }

        lines.push('    Validation Details:');
        lines.push(`      Is Class: ${result.details.isClass ? '✅' : '❌'}`);
        lines.push(`      Can Instantiate: ${result.details.canInstantiate ? '✅' : '❌'}`);
        lines.push(`      Has Render Methods: ${result.details.hasRenderMethods ? '✅' : '❌'}`);
        lines.push(`      Has Parameter Config: ${result.details.hasParameterConfig ? '✅' : '❌'}`);
        lines.push(`      Runtime Test: ${result.details.runtimeTest ? '✅' : '❌'}`);
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate a concise summary for console output
   */
  static generateSummary(summary: ValidationSummary): string {
    if (summary.overallValid) {
      const warningCount = summary.results.reduce((sum, r) => sum + r.warnings.length, 0);
      const warningText = warningCount > 0 ? ` (${warningCount} warnings)` : '';
      return `✅ All ${summary.totalTemplates} templates passed validation${warningText}`;
    } else {
      const failedTemplates = summary.results
        .filter(r => !r.isValid)
        .map(r => r.templateId)
        .join(', ');
      return `❌ ${summary.invalidTemplates} templates failed validation: ${failedTemplates}`;
    }
  }
}