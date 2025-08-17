#!/usr/bin/env node

/**
 * Fix trailing commas in converted template methods
 */

const fs = require('fs');
const path = require('path');

const templateFiles = [
  'src/renderer/templates/MultiLineStackTemplate.ts',
  'src/renderer/templates/FlickerFadeTemplate.ts', 
  'src/renderer/templates/MultiLineText.ts',
  'src/renderer/templates/GlitchText.ts',
  'src/renderer/templates/PhraseBlurFadeTemplate.ts',
  'src/renderer/templates/PhraseSyncTextPrimitive.ts',
  'src/renderer/templates/WordSlideText2.ts',
  'src/renderer/templates/WordSlideTextPrimitive.ts',
  'src/renderer/templates/WordSlideTextLLM.ts',
  'src/renderer/templates/WordSlideText.ts'
];

function fixTrailingCommas(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  let newContent = content;
  
  // Fix method trailing commas - look for patterns like:
  // },\n  /**
  // },\n  animateContainer
  // },\n  renderPhraseContainer
  // },\n  renderWordContainer  
  // },\n  renderCharContainer
  // },\n  removeVisualElements
  // },\n  getParameterConfig
  
  newContent = newContent.replace(/},([\s\n]*)(\/\*\*|animateContainer|renderPhraseContainer|renderWordContainer|renderCharContainer|removeVisualElements|getParameterConfig)/g, '}$1$2');
  
  // Also fix any remaining standalone "},\n" patterns at method boundaries
  newContent = newContent.replace(/},(\s*\n\s*)(\/\*\*)/g, '}$1$2');
  newContent = newContent.replace(/},(\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*\s*\()/g, '}$1$2');
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✅ Fixed ${filePath}`);
  } else {
    console.log(`⏭️  No changes needed for ${filePath}`);
  }
}

// Process all template files
templateFiles.forEach(fixTrailingCommas);

console.log('🎯 Trailing comma fix complete!');