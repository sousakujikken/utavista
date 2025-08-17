#!/usr/bin/env node

/**
 * テンプレート実装検証スクリプト
 * 文字位置計算などの重要な実装パターンを検証する
 */

const fs = require('fs');
const path = require('path');

// テンプレートディレクトリのパス
const TEMPLATES_DIR = path.join(__dirname, '../src/renderer/templates');

/**
 * 検証結果の型定義
 */
class ValidationResult {
  constructor() {
    this.passed = [];
    this.failed = [];
    this.warnings = [];
  }
  
  get isValid() {
    return this.failed.length === 0;
  }
  
  addError(message) {
    this.failed.push(message);
  }
  
  addWarning(message) {
    this.warnings.push(message);
  }
  
  addSuccess(message) {
    this.passed.push(message);
  }
}

/**
 * テンプレートファイルの検証
 */
function validateTemplateFile(filePath) {
  console.log(`\n🔍 Validating: ${path.basename(filePath)}`);
  
  const result = new ValidationResult();
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 1. 文字位置計算の階層チェック
  validateCharacterPositioning(content, result);
  
  // 2. 必須メソッドの存在チェック
  validateRequiredMethods(content, result);
  
  // 3. パラメータ定義チェック
  validateParameterDefinitions(content, result);
  
  // 4. エラーハンドリングチェック
  validateErrorHandling(content, result);
  
  // 結果の表示
  displayResults(result);
  
  return result;
}

/**
 * 文字位置計算の検証
 */
function validateCharacterPositioning(content, result) {
  // renderCharContainerでcharIndexを使用しているか
  const hasCharContainer = content.includes('renderCharContainer');
  const usesCharIndexInChar = hasCharContainer && content.match(/renderCharContainer[\s\S]*?charIndex/);
  
  if (hasCharContainer && usesCharIndexInChar) {
    result.addSuccess('✅ renderCharContainer uses charIndex parameter');
  } else if (hasCharContainer) {
    result.addError('❌ renderCharContainer does not use charIndex parameter');
  }
  
  // renderWordContainerで文字位置計算をしていないか
  const hasWordContainer = content.includes('renderWordContainer');
  const wordContainerSection = content.match(/renderWordContainer[\s\S]*?(?=render\w+Container|$)/);
  
  if (hasWordContainer && wordContainerSection) {
    const wrongCharPositioning = wordContainerSection[0].includes('CharacterSpacing') || 
                                wordContainerSection[0].includes('charIndex');
    
    if (wrongCharPositioning) {
      result.addError('❌ renderWordContainer incorrectly handles character positioning');
    } else {
      result.addSuccess('✅ renderWordContainer does not handle character positioning');
    }
  }
  
  // 文字位置計算メソッドの存在チェック
  const hasCharPositionMethod = content.includes('applyCharacterPosition') || 
                               content.includes('calculateCharacterPosition');
  
  if (hasCharContainer && hasCharPositionMethod) {
    result.addSuccess('✅ Has dedicated character positioning method');
  } else if (hasCharContainer) {
    result.addWarning('⚠️  Missing dedicated character positioning method');
  }
}

/**
 * 必須メソッドの検証
 */
function validateRequiredMethods(content, result) {
  const requiredMethods = [
    'renderPhraseContainer',
    'renderWordContainer', 
    'renderCharContainer',
    'getParameterConfig'
  ];
  
  requiredMethods.forEach(method => {
    if (content.includes(method)) {
      result.addSuccess(`✅ Has ${method} method`);
    } else {
      result.addError(`❌ Missing ${method} method`);
    }
  });
}

/**
 * パラメータ定義の検証
 */
function validateParameterDefinitions(content, result) {
  const requiredParams = ['fontSize', 'charSpacing'];
  const recommendedParams = ['fontFamily', 'textColor'];
  
  requiredParams.forEach(param => {
    if (content.includes(`"${param}"`)) {
      result.addSuccess(`✅ Defines ${param} parameter`);
    } else {
      result.addError(`❌ Missing ${param} parameter definition`);
    }
  });
  
  recommendedParams.forEach(param => {
    if (content.includes(`"${param}"`)) {
      result.addSuccess(`✅ Defines ${param} parameter`);
    } else {
      result.addWarning(`⚠️  Recommended ${param} parameter not found`);
    }
  });
}

/**
 * エラーハンドリングの検証
 */
function validateErrorHandling(content, result) {
  const hasTryCatch = content.includes('try') && content.includes('catch');
  const hasErrorLogging = content.includes('console.error') || content.includes('logger.error');
  
  if (hasTryCatch) {
    result.addSuccess('✅ Has try-catch error handling');
  } else {
    result.addWarning('⚠️  Missing try-catch error handling');
  }
  
  if (hasErrorLogging) {
    result.addSuccess('✅ Has error logging');
  } else {
    result.addWarning('⚠️  Missing error logging');
  }
}

/**
 * 結果の表示
 */
function displayResults(result) {
  if (result.passed.length > 0) {
    console.log('\n✅ Passed checks:');
    result.passed.forEach(msg => console.log(`  ${msg}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(msg => console.log(`  ${msg}`));
  }
  
  if (result.failed.length > 0) {
    console.log('\n❌ Failed checks:');
    result.failed.forEach(msg => console.log(`  ${msg}`));
  }
  
  console.log(`\n📊 Summary: ${result.passed.length} passed, ${result.warnings.length} warnings, ${result.failed.length} errors`);
}

/**
 * メイン実行関数
 */
function main() {
  console.log('🔍 Template Implementation Validator');
  console.log('===================================');
  
  try {
    const templateFiles = fs.readdirSync(TEMPLATES_DIR)
      .filter(file => file.endsWith('.ts') && !file.includes('.d.ts'))
      .map(file => path.join(TEMPLATES_DIR, file));
    
    const results = [];
    let totalErrors = 0;
    
    templateFiles.forEach(filePath => {
      const result = validateTemplateFile(filePath);
      results.push({ file: path.basename(filePath), result });
      totalErrors += result.failed.length;
    });
    
    // 全体サマリー
    console.log('\n📋 Overall Summary');
    console.log('==================');
    
    results.forEach(({ file, result }) => {
      const status = result.isValid ? '✅' : '❌';
      console.log(`${status} ${file}: ${result.failed.length} errors, ${result.warnings.length} warnings`);
    });
    
    if (totalErrors === 0) {
      console.log('\n🎉 All templates passed validation!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  Found ${totalErrors} errors across templates`);
      console.log('\n💡 Fix the character positioning issues by:');
      console.log('   1. Moving character positioning logic to renderCharContainer');
      console.log('   2. Using charIndex parameter for position calculation');
      console.log('   3. Removing character positioning from renderWordContainer');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = {
  validateTemplateFile,
  ValidationResult
};