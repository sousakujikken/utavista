/**
 * New Template Registry Design - Class-based Template System
 * 
 * This design eliminates compatibility layers and enforces direct class exports
 * for all animation templates, providing clear error messages and type safety.
 */

import { IAnimationTemplate, TemplateMetadata } from '../../types/types';
import * as templates from '../index';
import templatesConfig from './templates.json';
import { TemplatesJson } from './types';

// Enhanced registry entry type with class support
export interface TemplateRegistryEntry {
  id: string;
  name: string;
  template: IAnimationTemplate;
  templateClass: new () => IAnimationTemplate;
  metadata?: TemplateMetadata;
}

/**
 * Validates that a template export is a proper class constructor
 */
function validateTemplateClass(
  templateId: string, 
  exportName: string, 
  TemplateClass: any
): new () => IAnimationTemplate {
  // Check if it's a function (class constructor)
  if (typeof TemplateClass !== 'function') {
    throw new Error(
      `Template ${templateId} (${exportName}) must be exported as a class, ` +
      `not as ${typeof TemplateClass}. ` +
      `Please convert from object literal or instance export to class export.`
    );
  }

  // Check if it has a prototype (is a class/constructor function)
  if (!TemplateClass.prototype) {
    throw new Error(
      `Template ${templateId} (${exportName}) export is not a valid class constructor. ` +
      `Ensure you're exporting the class itself, not an instance.`
    );
  }

  return TemplateClass as new () => IAnimationTemplate;
}

/**
 * Validates that a template instance properly implements IAnimationTemplate
 */
function validateTemplateInstance(
  templateId: string,
  template: IAnimationTemplate
): void {
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
    throw new Error(
      `Template ${templateId} is missing required methods: ${missingMethods.join(', ')}. ` +
      `All templates must implement the complete IAnimationTemplate interface.`
    );
  }

  // Validate getParameterConfig if present
  if (template.getParameterConfig && typeof template.getParameterConfig !== 'function') {
    throw new Error(
      `Template ${templateId} has invalid getParameterConfig property. ` +
      `It must be a function or undefined.`
    );
  }
}

/**
 * Creates a template registry with strict class-based validation
 */
function createTemplateRegistry(): TemplateRegistryEntry[] {
  const config = templatesConfig as TemplatesJson;
  console.log('[NewTemplateRegistry] Creating class-based template registry');
  
  const entries: TemplateRegistryEntry[] = [];
  const errors: string[] = [];

  for (const templateConfig of config.templates) {
    try {
      // Get the template export
      const TemplateExport = (templates as any)[templateConfig.exportName];
      
      if (TemplateExport === undefined) {
        throw new Error(
          `Template ${templateConfig.id} export "${templateConfig.exportName}" not found. ` +
          `Check that it's properly exported from the template file and index.ts.`
        );
      }

      // Validate and get the class constructor
      const TemplateClass = validateTemplateClass(
        templateConfig.id,
        templateConfig.exportName,
        TemplateExport
      );

      // Create an instance for validation and use
      let template: IAnimationTemplate;
      try {
        template = new TemplateClass();
      } catch (error) {
        throw new Error(
          `Failed to instantiate template ${templateConfig.id}: ${error instanceof Error ? error.message : String(error)}. ` +
          `Ensure the class constructor doesn't require parameters.`
        );
      }

      // Validate the template instance
      validateTemplateInstance(templateConfig.id, template);

      // Create registry entry
      const entry: TemplateRegistryEntry = {
        id: templateConfig.id,
        name: templateConfig.name,
        template: template,
        templateClass: TemplateClass,
        metadata: template.metadata
      };

      entries.push(entry);
      console.log(`[NewTemplateRegistry] ✓ Successfully loaded class-based template: ${templateConfig.id}`);

    } catch (error) {
      const errorMessage = `Failed to load template ${templateConfig.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      console.error(`[NewTemplateRegistry] ✗ ${errorMessage}`);
    }
  }

  // If there are any errors, fail fast with comprehensive error report
  if (errors.length > 0) {
    const errorReport = [
      '=== TEMPLATE LOADING ERRORS ===',
      `${errors.length} template(s) failed to load:`,
      ...errors.map(error => `  • ${error}`),
      '',
      'All templates must be converted to class exports before proceeding.',
      'See migration documentation for conversion guidelines.'
    ].join('\n');
    
    throw new Error(errorReport);
  }

  console.log(`[NewTemplateRegistry] Successfully loaded ${entries.length} class-based templates`);
  return entries;
}

// Create the registry (will throw if any templates fail validation)
export const templateRegistry: TemplateRegistryEntry[] = createTemplateRegistry();

/**
 * Get template by ID - returns the template instance
 */
export function getTemplateById(id: string): IAnimationTemplate | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  return entry?.template;
}

/**
 * Get template class constructor by ID
 */
export function getTemplateClassById(id: string): (new () => IAnimationTemplate) | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  return entry?.templateClass;
}

/**
 * Create a new template instance by ID
 */
export function createTemplateInstance(id: string): IAnimationTemplate | undefined {
  const TemplateClass = getTemplateClassById(id);
  return TemplateClass ? new TemplateClass() : undefined;
}

/**
 * Get template parameter configuration
 */
export function getTemplateMetadata(id: string): any {
  const template = getTemplateById(id);
  if (template && typeof template.getParameterConfig === 'function') {
    return template.getParameterConfig();
  }
  console.error(`Template ${id} must implement getParameterConfig() method`);
  return [];
}

/**
 * Get all available templates
 */
export function getAllTemplates(): Array<{id: string, name: string}> {
  return templateRegistry.map(entry => ({
    id: entry.id,
    name: entry.name
  }));
}

/**
 * Get template authorship information
 */
export function getTemplateAuthorship(id: string): TemplateMetadata | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  return entry?.metadata;
}

// Backwards compatibility aliases
export const getTemplateByFullId = getTemplateById;
export const getFullIdFromShortId = (shortId: string) => shortId;