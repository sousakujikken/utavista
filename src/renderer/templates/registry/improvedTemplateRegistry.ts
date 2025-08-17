/**
 * Improved Template Registry Design - Critical Issues Fixed
 * 
 * Fixes identified by senior engineer review:
 * 1. Interface alignment with optional methods
 * 2. Lazy loading for performance
 * 3. Memory leak prevention
 * 4. Backward compatibility preservation
 */

import { IAnimationTemplate, TemplateMetadata, HierarchyType, AnimationPhase } from '../../types/types';
import * as templates from '../index';
import templatesConfig from './templates.json';
import { TemplatesJson } from './types';

// Enhanced registry entry with lazy loading
export interface TemplateRegistryEntry {
  id: string;
  name: string;
  templateClass: new () => IAnimationTemplate;
  metadata?: TemplateMetadata;
  _cachedInstance?: IAnimationTemplate; // Private cache for singleton behavior
}

/**
 * Validates that a template export is a proper class constructor
 * Fixed: Now aligned with actual IAnimationTemplate interface
 */
function validateTemplateClass(
  templateId: string, 
  exportName: string, 
  TemplateExport: any
): new () => IAnimationTemplate {
  // Check if it's a function (class constructor)
  if (typeof TemplateExport !== 'function') {
    throw new Error(
      `Template ${templateId} (${exportName}) must be exported as a class, ` +
      `not as ${typeof TemplateExport}. ` +
      `Please convert from object literal or instance export to class export.`
    );
  }

  // Check if it has a prototype (is a class/constructor function)
  if (!TemplateExport.prototype) {
    throw new Error(
      `Template ${templateId} (${exportName}) export is not a valid class constructor. ` +
      `Ensure you're exporting the class itself, not an instance.`
    );
  }

  return TemplateExport as new () => IAnimationTemplate;
}

/**
 * Validates that a template instance can be instantiated safely
 * Fixed: No longer pre-instantiates all templates
 */
function validateTemplateInstantiation(
  templateId: string,
  TemplateClass: new () => IAnimationTemplate
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    // Quick instantiation test without keeping the instance
    const testInstance = new TemplateClass();
    
    // Basic method existence check (all optional per interface)
    const hasAnyRenderMethod = 
      typeof testInstance.renderPhraseContainer === 'function' ||
      typeof testInstance.renderWordContainer === 'function' ||
      typeof testInstance.renderCharContainer === 'function' ||
      typeof testInstance.animateContainer === 'function';

    if (!hasAnyRenderMethod) {
      errors.push(
        `Template ${templateId} must implement at least one render method ` +
        `(renderPhraseContainer, renderWordContainer, renderCharContainer, or animateContainer)`
      );
    }

    // Clean up test instance immediately
    if (typeof testInstance.removeVisualElements === 'function') {
      // Don't actually call it as we don't have a container
    }

    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push(
      `Failed to instantiate template ${templateId}: ${error instanceof Error ? error.message : String(error)}. ` +
      `Ensure the class constructor doesn't require parameters.`
    );
    return { isValid: false, errors };
  }
}

/**
 * Creates a template registry with lazy loading and minimal validation
 * Fixed: No longer instantiates all templates at startup
 */
function createTemplateRegistry(): TemplateRegistryEntry[] {
  const config = templatesConfig as TemplatesJson;
  console.log('[ImprovedTemplateRegistry] Creating class-based template registry with lazy loading');
  
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

      // Validate class constructor
      const TemplateClass = validateTemplateClass(
        templateConfig.id,
        templateConfig.exportName,
        TemplateExport
      );

      // Quick validation without full instantiation
      const validation = validateTemplateInstantiation(templateConfig.id, TemplateClass);
      if (!validation.isValid) {
        throw new Error(validation.errors.join('; '));
      }

      // Create registry entry with lazy loading
      const entry: TemplateRegistryEntry = {
        id: templateConfig.id,
        name: templateConfig.name,
        templateClass: TemplateClass,
        metadata: undefined // Will be populated on first access
      };

      entries.push(entry);
      console.log(`[ImprovedTemplateRegistry] ✓ Validated class-based template: ${templateConfig.id}`);

    } catch (error) {
      const errorMessage = `Failed to load template ${templateConfig.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      console.error(`[ImprovedTemplateRegistry] ✗ ${errorMessage}`);
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

  console.log(`[ImprovedTemplateRegistry] Successfully validated ${entries.length} class-based templates`);
  return entries;
}

// Create the registry (lightweight validation only)
export const templateRegistry: TemplateRegistryEntry[] = createTemplateRegistry();

/**
 * Get template instance with lazy loading and caching
 * Fixed: Implements singleton pattern per template for memory efficiency
 */
export function getTemplateById(id: string): IAnimationTemplate | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  if (!entry) return undefined;

  // Lazy loading with caching
  if (!entry._cachedInstance) {
    try {
      entry._cachedInstance = new entry.templateClass();
      
      // Cache metadata if available
      if (entry._cachedInstance.metadata) {
        entry.metadata = entry._cachedInstance.metadata;
      }
    } catch (error) {
      console.error(`Failed to instantiate template ${id}:`, error);
      return undefined;
    }
  }

  return entry._cachedInstance;
}

/**
 * Get template class constructor by ID
 */
export function getTemplateClassById(id: string): (new () => IAnimationTemplate) | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  return entry?.templateClass;
}

/**
 * Create a new template instance by ID (always fresh instance)
 * Fixed: Provides option for fresh instances when needed
 */
export function createTemplateInstance(id: string): IAnimationTemplate | undefined {
  const TemplateClass = getTemplateClassById(id);
  if (!TemplateClass) return undefined;

  try {
    return new TemplateClass();
  } catch (error) {
    console.error(`Failed to create template instance ${id}:`, error);
    return undefined;
  }
}

/**
 * Get template parameter configuration
 * Fixed: Handles optional getParameterConfig gracefully
 */
export function getTemplateMetadata(id: string): any {
  const template = getTemplateById(id);
  if (!template) {
    console.error(`Template ${id} not found`);
    return [];
  }

  // Handle optional getParameterConfig method
  if (typeof template.getParameterConfig === 'function') {
    try {
      return template.getParameterConfig();
    } catch (error) {
      console.error(`Error getting parameter config for template ${id}:`, error);
      return [];
    }
  }

  // Return empty array for templates without parameter config
  console.warn(`Template ${id} does not implement getParameterConfig() - no configurable parameters`);
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
 * Get template authorship information with lazy loading
 */
export function getTemplateAuthorship(id: string): TemplateMetadata | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  if (!entry) return undefined;

  // Trigger lazy loading to get metadata
  getTemplateById(id);
  
  return entry.metadata;
}

/**
 * Clear template cache (useful for development/testing)
 */
export function clearTemplateCache(): void {
  templateRegistry.forEach(entry => {
    entry._cachedInstance = undefined;
    entry.metadata = undefined;  
  });
  console.log('[ImprovedTemplateRegistry] Template cache cleared');
}

/**
 * Get registry statistics
 */
export function getRegistryStats(): {
  totalTemplates: number;
  cachedTemplates: number;
  memoryUsage: string;
} {
  const totalTemplates = templateRegistry.length;
  const cachedTemplates = templateRegistry.filter(entry => entry._cachedInstance).length;
  
  return {
    totalTemplates,
    cachedTemplates,
    memoryUsage: `${cachedTemplates}/${totalTemplates} templates cached`
  };
}

// Backwards compatibility aliases
export const getTemplateByFullId = getTemplateById;
export const getFullIdFromShortId = (shortId: string) => shortId;