/**
 * Template Validation Schema
 * 
 * Comprehensive validation system for class-based animation templates
 * to ensure compatibility and correct implementation.
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
    hasRequiredMethods: boolean;
    hasParameterConfig: boolean;
    canInstantiate: boolean;
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
 * Template validator class
 */
export class TemplateValidator {
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
   * Validate that a template instance implements required methods
   */
  static validateRequiredMethods(templateId: string, template: IAnimationTemplate): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required methods
    const requiredMethods = [
      'animateContainer',
      'renderPhraseContainer',
      'renderWordContainer', 
      'renderCharContainer',
      'removeVisualElements'
    ] as const;

    const missingMethods: string[] = [];

    for (const method of requiredMethods) {
      if (typeof template[method] !== 'function') {
        missingMethods.push(method);
      }
    }

    if (missingMethods.length > 0) {
      errors.push(`Missing required methods: ${missingMethods.join(', ')}`);
    }

    // Optional but recommended methods
    if (typeof template.getParameterConfig !== 'function') {
      warnings.push('getParameterConfig() method not implemented - template will have no configurable parameters');
    }

    return { 
      isValid: missingMethods.length === 0, 
      errors, 
      warnings 
    };
  }

  /**
   * Validate parameter configuration
   */
  static validateParameterConfig(templateId: string, template: IAnimationTemplate): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof template.getParameterConfig !== 'function') {
      return { isValid: true, errors: [], warnings: ['No parameter configuration method'] };
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

    // Validate each parameter config
    for (let i = 0; i < config.length; i++) {
      const param = config[i];
      const paramContext = `Parameter ${i} (${param?.name || 'unnamed'})`;

      if (!param.name || typeof param.name !== 'string') {
        errors.push(`${paramContext}: must have a valid string name`);
      }

      if (!param.type || typeof param.type !== 'string') {
        errors.push(`${paramContext}: must have a valid string type`);
      }

      if (param.default === undefined) {
        warnings.push(`${paramContext}: no default value specified`);
      }

      // Type-specific validations
      if (param.type === 'number') {
        if (typeof param.default !== 'number') {
          errors.push(`${paramContext}: number type must have numeric default value`);
        }
        if (param.min !== undefined && typeof param.min !== 'number') {
          errors.push(`${paramContext}: min value must be a number`);
        }
        if (param.max !== undefined && typeof param.max !== 'number') {
          errors.push(`${paramContext}: max value must be a number`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Perform basic runtime test of template methods
   */
  static validateRuntimeBehavior(templateId: string, template: IAnimationTemplate): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Create minimal test environment
    const testContainer = new PIXI.Container();
    const testParams = {};
    const nowMs = 1000;
    const startMs = 0;
    const endMs = 2000;
    const phase = AnimationPhase.Active;
    const hierarchyType = HierarchyType.Character;

    try {
      // Test animateContainer
      if (typeof template.animateContainer === 'function') {
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
      }

      // Test renderCharContainer (most critical)
      if (typeof template.renderCharContainer === 'function') {
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
      }

      // Test removeVisualElements
      if (typeof template.removeVisualElements === 'function') {
        template.removeVisualElements(testContainer);
      }

    } catch (error) {
      errors.push(
        `Runtime test failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Cleanup
      testContainer.destroy({ children: true });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Perform comprehensive validation of a template class
   */
  static validateTemplate(templateId: string, TemplateExport: any): TemplateValidationResult {
    const result: TemplateValidationResult = {
      templateId,
      isValid: false,
      errors: [],
      warnings: [],
      details: {
        isClass: false,
        hasRequiredMethods: false,
        hasParameterConfig: false,
        canInstantiate: false,
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

    // Step 3: Validate required methods
    const methodValidation = this.validateRequiredMethods(templateId, template);
    result.details.hasRequiredMethods = methodValidation.isValid;
    result.errors.push(...methodValidation.errors);
    result.warnings.push(...methodValidation.warnings);

    // Step 4: Validate parameter configuration
    const paramValidation = this.validateParameterConfig(templateId, template);
    result.details.hasParameterConfig = paramValidation.isValid;
    result.errors.push(...paramValidation.errors);
    result.warnings.push(...paramValidation.warnings);

    // Step 5: Runtime behavior test
    const runtimeValidation = this.validateRuntimeBehavior(templateId, template);
    result.details.runtimeTest = runtimeValidation.isValid;
    result.errors.push(...runtimeValidation.errors);
    result.warnings.push(...runtimeValidation.warnings);

    // Overall validation
    result.isValid = result.details.isClass && 
                    result.details.canInstantiate && 
                    result.details.hasRequiredMethods && 
                    result.details.hasParameterConfig && 
                    result.details.runtimeTest;

    return result;
  }

  /**
   * Validate multiple templates and provide summary
   */
  static validateTemplates(templates: Record<string, any>): ValidationSummary {
    const results: TemplateValidationResult[] = [];

    for (const [templateId, TemplateExport] of Object.entries(templates)) {
      const result = this.validateTemplate(templateId, TemplateExport);
      results.push(result);
    }

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
 * Utility functions for validation reporting
 */
export class ValidationReporter {
  /**
   * Generate a detailed validation report
   */
  static generateReport(summary: ValidationSummary): string {
    const lines: string[] = [];

    lines.push('=== TEMPLATE VALIDATION REPORT ===');
    lines.push(`Total Templates: ${summary.totalTemplates}`);
    lines.push(`Valid Templates: ${summary.validTemplates}`);
    lines.push(`Invalid Templates: ${summary.invalidTemplates}`);
    lines.push(`Overall Status: ${summary.overallValid ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');

    for (const result of summary.results) {
      lines.push(`Template: ${result.templateId} ${result.isValid ? '✓' : '✗'}`);
      
      if (result.errors.length > 0) {
        lines.push('  Errors:');
        result.errors.forEach(error => lines.push(`    • ${error}`));
      }

      if (result.warnings.length > 0) {
        lines.push('  Warnings:');
        result.warnings.forEach(warning => lines.push(`    • ${warning}`));
      }

      lines.push('  Details:');
      lines.push(`    Is Class: ${result.details.isClass ? '✓' : '✗'}`);
      lines.push(`    Can Instantiate: ${result.details.canInstantiate ? '✓' : '✗'}`);
      lines.push(`    Has Required Methods: ${result.details.hasRequiredMethods ? '✓' : '✗'}`);
      lines.push(`    Has Parameter Config: ${result.details.hasParameterConfig ? '✓' : '✗'}`);
      lines.push(`    Runtime Test: ${result.details.runtimeTest ? '✓' : '✗'}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate a concise summary for console output
   */
  static generateSummary(summary: ValidationSummary): string {
    if (summary.overallValid) {
      return `✓ All ${summary.totalTemplates} templates passed validation`;
    } else {
      const failedTemplates = summary.results
        .filter(r => !r.isValid)
        .map(r => r.templateId)
        .join(', ');
      return `✗ ${summary.invalidTemplates} templates failed validation: ${failedTemplates}`;
    }
  }
}