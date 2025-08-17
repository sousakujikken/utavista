#!/usr/bin/env node

/**
 * パラメータ検証スクリプト
 * 新しいパラメータが適切に定義されているかチェック
 */

const fs = require('fs');
const path = require('path');

const STANDARD_PARAMS_PATH = path.join(__dirname, '../src/types/StandardParameters.ts');
const TEMPLATE_PARAMS_PATH = path.join(__dirname, '../src/types/TemplateParameters.ts');
const TEMPLATES_DIR = path.join(__dirname, '../src/renderer/templates');

/**
 * TypeScriptファイルからパラメータを抽出
 */
function extractParametersFromInterface(content, interfaceName) {
  const interfaceMatch = content.match(new RegExp(`interface ${interfaceName}\\s*{([^}]+)}`, 's'));
  if (!interfaceMatch) return [];
  
  const params = [];
  const lines = interfaceMatch[1].split('\n');
  
  for (const line of lines) {
    const paramMatch = line.match(/^\s*(\w+)(\?)?:\s*(\w+);/);
    if (paramMatch) {
      params.push({
        name: paramMatch[1],
        optional: !!paramMatch[2],
        type: paramMatch[3]
      });
    }
  }
  
  return params;
}

/**
 * デフォルト値オブジェクトからパラメータを抽出
 */
function extractDefaultParameters(content) {
  const defaultMatch = content.match(/DEFAULT_PARAMETERS[^=]*=\s*{([^}]+)}/s);
  if (!defaultMatch) return [];
  
  const params = [];
  const lines = defaultMatch[1].split('\n');
  
  for (const line of lines) {
    const paramMatch = line.match(/^\s*(\w+):\s*(.+),?\s*$/);
    if (paramMatch) {
      params.push(paramMatch[1]);
    }
  }
  
  return params;
}

/**
 * テンプレートファイルからgetParameterConfig内のパラメータを抽出
 */
function extractTemplateParameters(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const params = new Set();
  
  // getParameterConfig内のnameフィールドを探す
  const configMatch = content.match(/getParameterConfig[^{]*{([^}]+)}/s);
  if (configMatch) {
    const nameMatches = configMatch[1].matchAll(/name:\s*['"](\w+)['"]/g);
    for (const match of nameMatches) {
      params.add(match[1]);
    }
  }
  
  // パラメータ使用箇所を探す（this.params.xxx形式）
  const usageMatches = content.matchAll(/this\.params\.(\w+)/g);
  for (const match of usageMatches) {
    params.add(match[1]);
  }
  
  return Array.from(params);
}

/**
 * 検証の実行
 */
function validate() {
  console.log('🔍 パラメータ検証を開始します...\n');
  
  // 1. StandardParametersの読み込み
  const standardContent = fs.readFileSync(STANDARD_PARAMS_PATH, 'utf8');
  const standardParams = extractParametersFromInterface(standardContent, 'StandardParameters');
  const defaultParams = extractDefaultParameters(standardContent);
  
  console.log(`📋 StandardParametersに定義されているパラメータ: ${standardParams.length}個`);
  console.log(`📋 DEFAULT_PARAMETERSに定義されているパラメータ: ${defaultParams.length}個\n`);
  
  // 2. インターフェースとデフォルト値の一致確認
  const interfaceParamNames = standardParams.map(p => p.name);
  const missingDefaults = interfaceParamNames.filter(name => !defaultParams.includes(name));
  const extraDefaults = defaultParams.filter(name => !interfaceParamNames.includes(name));
  
  if (missingDefaults.length > 0) {
    console.log('❌ DEFAULT_PARAMETERSに定義されていないパラメータ:');
    missingDefaults.forEach(name => {
      const param = standardParams.find(p => p.name === name);
      if (param?.optional) {
        console.log(`   - ${name} (オプショナル)`);
      } else {
        console.log(`   - ${name} ⚠️  (必須パラメータ)`);
      }
    });
    console.log('');
  }
  
  if (extraDefaults.length > 0) {
    console.log('❌ StandardParametersに定義されていないデフォルト値:');
    extraDefaults.forEach(name => console.log(`   - ${name}`));
    console.log('');
  }
  
  // 3. テンプレートファイルの検証
  console.log('📁 テンプレートファイルを検証中...\n');
  
  const templateFiles = fs.readdirSync(TEMPLATES_DIR)
    .filter(file => file.endsWith('.ts') && !file.includes('index') && !file.includes('registry'));
  
  const undefinedParams = new Set();
  
  for (const file of templateFiles) {
    const filePath = path.join(TEMPLATES_DIR, file);
    const templateParams = extractTemplateParameters(filePath);
    
    console.log(`📄 ${file}:`);
    console.log(`   使用パラメータ数: ${templateParams.length}`);
    
    // 未定義パラメータのチェック
    const undefined = templateParams.filter(param => !interfaceParamNames.includes(param));
    if (undefined.length > 0) {
      console.log(`   ⚠️  未定義パラメータ: ${undefined.join(', ')}`);
      undefined.forEach(p => undefinedParams.add(p));
    } else {
      console.log(`   ✅ すべてのパラメータが定義済み`);
    }
    console.log('');
  }
  
  // 4. サマリー
  console.log('📊 検証結果サマリー:');
  console.log(`   - 標準パラメータ数: ${standardParams.length}`);
  console.log(`   - デフォルト値定義数: ${defaultParams.length}`);
  console.log(`   - 検証したテンプレート数: ${templateFiles.length}`);
  
  if (undefinedParams.size > 0) {
    console.log(`\n⚠️  未定義パラメータ一覧:`);
    Array.from(undefinedParams).forEach(param => {
      console.log(`   - ${param}`);
    });
    console.log('\nこれらのパラメータをStandardParameters.tsに追加してください。');
  } else {
    console.log('\n✅ すべてのパラメータが適切に定義されています！');
  }
}

// スクリプトの実行
validate();