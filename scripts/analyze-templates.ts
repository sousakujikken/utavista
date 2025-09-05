#!/usr/bin/env tsx

/**
 * Template Analysis Script - Step 2 Implementation
 * 
 * Analyzes existing templates to classify patterns and identify
 * conversion requirements before migration.
 */

import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TemplateAnalysis {
  filePath: string;
  templateName: string;
  pattern: 'object-literal' | 'class-instance' | 'class-only' | 'unknown';
  exports: {
    hasDefault: boolean;
    hasNamed: boolean;
    namedExports: string[];
  };
  structure: {
    hasMetadata: boolean;
    hasGetParameterConfig: boolean;
    implementedMethods: string[];
    missingMethods: string[];
  };
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
    location?: { line: number; column: number };
  }>;
  complexity: 'low' | 'medium' | 'high';
  migrationEffort: 'easy' | 'moderate' | 'complex';
}

interface AnalysisReport {
  totalTemplates: number;
  patternDistribution: Record<string, number>;
  complexityDistribution: Record<string, number>;
  migrationReadiness: {
    ready: number;
    needsWork: number;
    complex: number;
  };
  templates: TemplateAnalysis[];
}

class TemplateAnalyzer {
  private analyses: TemplateAnalysis[] = [];
  private program: ts.Program;
  private checker: ts.TypeChecker;

  constructor(private basePath: string) {
    // Create TypeScript program for type checking
    const configPath = ts.findConfigFile(basePath, ts.sys.fileExists, 'tsconfig.json');
    const configFile = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : undefined;
    
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true
    };

    if (configFile && !configFile.error) {
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath || '')
      );
      Object.assign(compilerOptions, parsedConfig.options);
    }

    // Get all template files for program creation
    const templateFiles = this.getTemplateFilesSync();
    
    this.program = ts.createProgram(templateFiles, compilerOptions);
    this.checker = this.program.getTypeChecker();
  }

  /**
   * Analyze all templates
   */
  async analyzeAllTemplates(): Promise<AnalysisReport> {
    console.log('🔍 Starting comprehensive template analysis...');

    const templateFiles = await this.discoverTemplateFiles();
    console.log(`📁 Found ${templateFiles.length} template files to analyze`);

    for (const filePath of templateFiles) {
      const analysis = await this.analyzeTemplate(filePath);
      this.analyses.push(analysis);
      
      const statusIcon = this.getStatusIcon(analysis);
      console.log(`${statusIcon} ${analysis.templateName} - ${analysis.pattern} (${analysis.complexity})`);
    }

    return this.generateReport();
  }

  /**
   * Get template files synchronously for TypeScript program
   */
  private getTemplateFilesSync(): string[] {
    const templateDir = path.join(this.basePath, 'src/renderer/templates');
    const files = require('glob').sync('*.ts', {
      cwd: templateDir,
      ignore: ['index.ts', '**/*.d.ts', '**/registry/**', '**/validation/**'],
      absolute: true
    });
    return files;
  }

  /**
   * Discover template files asynchronously
   */
  private async discoverTemplateFiles(): Promise<string[]> {
    const templateDir = path.join(this.basePath, 'src/renderer/templates');
    try {
      const files = await fs.readdir(templateDir);
      const templateFiles = files
        .filter(file => file.endsWith('.ts'))
        .filter(file => file !== 'index.ts')
        .filter(file => !file.endsWith('.d.ts'))
        .map(file => path.join(templateDir, file));
      
      // Filter out registry and validation subdirectories
      const finalFiles: string[] = [];
      for (const file of templateFiles) {
        const stat = await fs.stat(file);
        if (stat.isFile()) {
          finalFiles.push(file);
        }
      }
      
      return finalFiles;
    } catch (error) {
      console.error('Error discovering template files:', error);
      return [];
    }
  }

  /**
   * Analyze individual template file
   */
  private async analyzeTemplate(filePath: string): Promise<TemplateAnalysis> {
    const content = await fs.readFile(filePath, 'utf-8');
    const sourceFile = this.program.getSourceFile(filePath);
    
    if (!sourceFile) {
      throw new Error(`Could not parse source file: ${filePath}`);
    }

    const analysis: TemplateAnalysis = {
      filePath,
      templateName: path.basename(filePath, '.ts'),
      pattern: 'unknown',
      exports: {
        hasDefault: false,
        hasNamed: false,
        namedExports: []
      },
      structure: {
        hasMetadata: false,
        hasGetParameterConfig: false,
        implementedMethods: [],
        missingMethods: []
      },
      issues: [],
      complexity: 'low',
      migrationEffort: 'easy'
    };

    // Analyze AST
    this.analyzeSourceFile(sourceFile, analysis);
    
    // Determine pattern and complexity
    this.determinePattern(analysis);
    this.assessComplexity(analysis);
    
    // Check for issues
    this.checkForIssues(sourceFile, analysis);

    return analysis;
  }

  /**
   * Analyze source file AST
   */
  private analyzeSourceFile(sourceFile: ts.SourceFile, analysis: TemplateAnalysis): void {
    const visit = (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.VariableStatement:
          this.analyzeVariableStatement(node as ts.VariableStatement, analysis);
          break;
        
        case ts.SyntaxKind.ClassDeclaration:
          this.analyzeClassDeclaration(node as ts.ClassDeclaration, analysis);
          break;
        
        case ts.SyntaxKind.ExportAssignment:
          analysis.exports.hasDefault = true;
          break;
        
        case ts.SyntaxKind.ExportDeclaration:
          this.analyzeExportDeclaration(node as ts.ExportDeclaration, analysis);
          break;
        
        case ts.SyntaxKind.ImportDeclaration:
          // Could analyze imports for complexity assessment
          break;
      }
      
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  /**
   * Analyze variable statements (object literals)
   */
  private analyzeVariableStatement(node: ts.VariableStatement, analysis: TemplateAnalysis): void {
    const hasExportModifier = node.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
    );

    if (hasExportModifier) {
      analysis.exports.hasNamed = true;
      
      node.declarationList.declarations.forEach(decl => {
        if (ts.isVariableDeclaration(decl) && decl.name && ts.isIdentifier(decl.name)) {
          analysis.exports.namedExports.push(decl.name.text);
          
          if (decl.initializer) {
            if (ts.isObjectLiteralExpression(decl.initializer)) {
              // Object literal pattern
              this.analyzeObjectLiteral(decl.initializer, analysis);
            } else if (ts.isNewExpression(decl.initializer)) {
              // Class instance pattern
              analysis.pattern = 'class-instance';
            }
          }
        }
      });
    }
  }

  /**
   * Analyze object literal expressions
   */
  private analyzeObjectLiteral(objLiteral: ts.ObjectLiteralExpression, analysis: TemplateAnalysis): void {
    const foundProperties = new Set<string>();
    const animationMethods = [
      'animateContainer', 'renderPhraseContainer', 
      'renderWordContainer', 'renderCharContainer',
      'removeVisualElements'
    ];

    objLiteral.properties.forEach(prop => {
      if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
        if (ts.isIdentifier(prop.name)) {
          const propName = prop.name.text;
          foundProperties.add(propName);

          if (propName === 'metadata') {
            analysis.structure.hasMetadata = true;
          } else if (propName === 'getParameterConfig') {
            analysis.structure.hasGetParameterConfig = true;
          } else if (animationMethods.includes(propName)) {
            analysis.structure.implementedMethods.push(propName);
          }
        }
      }
    });

    // Check for missing methods
    const missingMethods = animationMethods.filter(method => 
      !foundProperties.has(method)
    );
    analysis.structure.missingMethods = missingMethods;

    // Determine if this is a template object literal
    if (analysis.structure.implementedMethods.length > 0) {
      analysis.pattern = 'object-literal';
    }
  }

  /**
   * Analyze class declarations
   */
  private analyzeClassDeclaration(node: ts.ClassDeclaration, analysis: TemplateAnalysis): void {
    const hasExportModifier = node.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
    );

    if (hasExportModifier) {
      analysis.exports.hasNamed = true;
      if (node.name) {
        analysis.exports.namedExports.push(node.name.text);
      }
    }

    // Analyze class members
    const animationMethods = [
      'animateContainer', 'renderPhraseContainer', 
      'renderWordContainer', 'renderCharContainer',
      'removeVisualElements'
    ];

    node.members.forEach(member => {
      if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
        if (member.name && ts.isIdentifier(member.name)) {
          const memberName = member.name.text;
          
          if (memberName === 'metadata') {
            analysis.structure.hasMetadata = true;
          } else if (memberName === 'getParameterConfig') {
            analysis.structure.hasGetParameterConfig = true;
          } else if (animationMethods.includes(memberName)) {
            analysis.structure.implementedMethods.push(memberName);
          }
        }
      }
    });

    // Check for missing methods
    const missingMethods = animationMethods.filter(method => 
      !analysis.structure.implementedMethods.includes(method)
    );
    analysis.structure.missingMethods = missingMethods;

    if (hasExportModifier) {
      analysis.pattern = 'class-only';
    }
  }

  /**
   * Analyze export declarations
   */
  private analyzeExportDeclaration(node: ts.ExportDeclaration, analysis: TemplateAnalysis): void {
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      node.exportClause.elements.forEach(element => {
        analysis.exports.namedExports.push(element.name.text);
      });
      analysis.exports.hasNamed = true;
    }
  }

  /**
   * Determine template pattern based on analysis
   */
  private determinePattern(analysis: TemplateAnalysis): void {
    if (analysis.pattern === 'unknown') {
      // Make educated guess based on exports and structure
      if (analysis.exports.hasNamed && !analysis.exports.hasDefault) {
        if (analysis.structure.implementedMethods.length > 0) {
          analysis.pattern = 'class-only'; // Likely already converted
        }
      } else if (analysis.exports.hasDefault && analysis.exports.hasNamed) {
        analysis.pattern = 'object-literal'; // Common pattern
      }
    }
  }

  /**
   * Assess template complexity
   */
  private assessComplexity(analysis: TemplateAnalysis): void {
    let complexityScore = 0;

    // Pattern complexity
    if (analysis.pattern === 'class-instance') complexityScore += 2;
    if (analysis.pattern === 'object-literal') complexityScore += 1;

    // Method count complexity
    complexityScore += analysis.structure.implementedMethods.length * 0.5;

    // Missing methods (could indicate custom implementations)
    complexityScore += analysis.structure.missingMethods.length * 0.3;

    // Export complexity
    if (!analysis.exports.hasDefault) complexityScore += 1;
    if (analysis.exports.namedExports.length > 2) complexityScore += 1;

    // Determine complexity level
    if (complexityScore <= 2) {
      analysis.complexity = 'low';
      analysis.migrationEffort = 'easy';
    } else if (complexityScore <= 4) {
      analysis.complexity = 'medium';
      analysis.migrationEffort = 'moderate';
    } else {
      analysis.complexity = 'high';
      analysis.migrationEffort = 'complex';
    }
  }

  /**
   * Check for potential issues
   */
  private checkForIssues(sourceFile: ts.SourceFile, analysis: TemplateAnalysis): void {
    // Check TypeScript diagnostics
    const diagnostics = this.program.getSemanticDiagnostics(sourceFile)
      .concat(this.program.getSyntacticDiagnostics(sourceFile));

    diagnostics.forEach(diagnostic => {
      if (diagnostic.file === sourceFile && diagnostic.start !== undefined) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
        analysis.issues.push({
          type: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          location: { line: line + 1, column: character + 1 }
        });
      }
    });

    // Custom checks
    if (!analysis.structure.hasGetParameterConfig) {
      analysis.issues.push({
        type: 'warning',
        message: 'Template does not implement getParameterConfig() - will have no configurable parameters'
      });
    }

    if (analysis.structure.implementedMethods.length === 0) {
      analysis.issues.push({
        type: 'error',
        message: 'Template does not implement any animation methods'
      });
    }

    if (!analysis.exports.hasDefault && analysis.pattern !== 'class-only') {
      analysis.issues.push({
        type: 'warning',
        message: 'Template missing default export - may cause import issues'
      });
    }

    if (analysis.structure.missingMethods.includes('removeVisualElements')) {
      analysis.issues.push({
        type: 'warning',
        message: 'Missing removeVisualElements method - potential memory leaks'
      });
    }
  }

  /**
   * Generate comprehensive analysis report
   */
  private generateReport(): AnalysisReport {
    const patternDistribution: Record<string, number> = {};
    const complexityDistribution: Record<string, number> = {};
    
    let ready = 0, needsWork = 0, complex = 0;

    this.analyses.forEach(analysis => {
      // Pattern distribution
      patternDistribution[analysis.pattern] = (patternDistribution[analysis.pattern] || 0) + 1;
      
      // Complexity distribution
      complexityDistribution[analysis.complexity] = (complexityDistribution[analysis.complexity] || 0) + 1;
      
      // Migration readiness
      switch (analysis.migrationEffort) {
        case 'easy': ready++; break;
        case 'moderate': needsWork++; break;
        case 'complex': complex++; break;
      }
    });

    return {
      totalTemplates: this.analyses.length,
      patternDistribution,
      complexityDistribution,
      migrationReadiness: { ready, needsWork, complex },
      templates: this.analyses
    };
  }

  /**
   * Get status icon for template
   */
  private getStatusIcon(analysis: TemplateAnalysis): string {
    if (analysis.issues.some(issue => issue.type === 'error')) {
      return '❌';
    } else if (analysis.migrationEffort === 'easy') {
      return '✅';
    } else if (analysis.migrationEffort === 'moderate') {
      return '⚠️';
    } else {
      return '🔴';
    }
  }

  /**
   * Generate detailed text report
   */
  generateDetailedReport(report: AnalysisReport): string {
    const lines = [
      '=== COMPREHENSIVE TEMPLATE ANALYSIS REPORT ===',
      `Analysis Date: ${new Date().toISOString()}`,
      `Total Templates Analyzed: ${report.totalTemplates}`,
      '',
      '📊 PATTERN DISTRIBUTION:',
      ...Object.entries(report.patternDistribution).map(([pattern, count]) => 
        `  ${pattern}: ${count} templates (${((count / report.totalTemplates) * 100).toFixed(1)}%)`
      ),
      '',
      '🎯 COMPLEXITY DISTRIBUTION:',
      ...Object.entries(report.complexityDistribution).map(([complexity, count]) => 
        `  ${complexity}: ${count} templates (${((count / report.totalTemplates) * 100).toFixed(1)}%)`
      ),
      '',
      '🚀 MIGRATION READINESS:',
      `  Ready for Migration: ${report.migrationReadiness.ready} templates`,
      `  Needs Preparation: ${report.migrationReadiness.needsWork} templates`,
      `  Complex Migration: ${report.migrationReadiness.complex} templates`,
      '',
      '📋 DETAILED TEMPLATE ANALYSIS:',
      ''
    ];

    // Group templates by migration effort
    const grouped = {
      easy: report.templates.filter(t => t.migrationEffort === 'easy'),
      moderate: report.templates.filter(t => t.migrationEffort === 'moderate'),
      complex: report.templates.filter(t => t.migrationEffort === 'complex')
    };

    Object.entries(grouped).forEach(([effort, templates]) => {
      if (templates.length === 0) return;
      
      lines.push(`${effort.toUpperCase()} MIGRATION (${templates.length} templates):`);
      
      templates.forEach(template => {
        const icon = this.getStatusIcon(template);
        lines.push(`  ${icon} ${template.templateName}`);
        lines.push(`     Pattern: ${template.pattern}`);
        lines.push(`     Methods: [${template.structure.implementedMethods.join(', ')}]`);
        lines.push(`     Exports: ${template.exports.hasDefault ? 'default' : ''}${template.exports.hasDefault && template.exports.hasNamed ? '+' : ''}${template.exports.hasNamed ? 'named' : ''}`);
        
        if (template.issues.length > 0) {
          lines.push(`     Issues: ${template.issues.length}`);
          template.issues.slice(0, 3).forEach(issue => {
            const location = issue.location ? ` (${issue.location.line}:${issue.location.column})` : '';
            lines.push(`       ${issue.type === 'error' ? '❌' : '⚠️'} ${issue.message}${location}`);
          });
          if (template.issues.length > 3) {
            lines.push(`       ... and ${template.issues.length - 3} more issues`);
          }
        }
        
        lines.push('');
      });
    });

    return lines.join('\n');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const basePath = process.cwd();
  const analyzer = new TemplateAnalyzer(basePath);

  try {
    console.log('🔍 Starting Comprehensive Template Analysis...');
    console.log(`📁 Base Path: ${basePath}`);

    const report = await analyzer.analyzeAllTemplates();
    const detailedReport = analyzer.generateDetailedReport(report);

    console.log('\n' + detailedReport);

    // Write report to file
    const reportPath = path.join(basePath, 'template-analysis-report.txt');
    await fs.writeFile(reportPath, detailedReport, 'utf-8');
    console.log(`📄 Report saved to: ${reportPath}`);

    // Write JSON report for programmatic use
    const jsonReportPath = path.join(basePath, 'template-analysis-report.json');
    await fs.writeFile(jsonReportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📊 JSON report saved to: ${jsonReportPath}`);

    console.log('\n🎯 Analysis Summary:');
    console.log(`✅ Ready for migration: ${report.migrationReadiness.ready} templates`);
    console.log(`⚠️ Need preparation: ${report.migrationReadiness.needsWork} templates`);
    console.log(`🔴 Complex migration: ${report.migrationReadiness.complex} templates`);

  } catch (error) {
    console.error('💥 Analysis failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { TemplateAnalyzer, TemplateAnalysis, AnalysisReport };