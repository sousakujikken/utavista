# Known Issues and Workarounds

This document tracks known issues in UTAVISTA v0.4.3 and provides workarounds until they are resolved.

## Layout and Rendering Issues

### LINE-HEIGHT-001: lineHeight Parameter Double Scaling in new_line Modes

**Status**: Known Issue  
**Affected Components**: FlexibleCumulativeLayoutPrimitive  
**Affected Modes**: `individual_word_entrance_new_line`, `phrase_cumulative_new_line`  
**Severity**: Medium  
**First Reported**: v0.4.3  

#### Problem Description

In wordDisplayMode's new_line modes, the `lineHeight` parameter produces double the expected line spacing. When `lineHeight: 0.5` is set, it visually appears as 1 line offset instead of the expected 0.5 line offset.

#### Root Cause

The issue stems from inconsistency between logical resolution (1920×1080) and CSS scaling factor (~0.417) in the display pipeline. The line height calculation formula in FlexibleCumulativeLayoutPrimitive:

```typescript
// FlexibleCumulativeLayoutPrimitive.ts:548, 598
const lineY = wordIndex * params.fontSize * params.lineHeight;
```

This calculation occurs in logical coordinate space but doesn't account for the CSS scaling transformation applied to the PIXI canvas.

#### Affected Code Locations

- `/src/renderer/primitives/layout/FlexibleCumulativeLayoutPrimitive.ts:548`
- `/src/renderer/primitives/layout/FlexibleCumulativeLayoutPrimitive.ts:598`

#### Workaround

**For Template Developers**: When using new_line modes, specify half the desired line height value:

```typescript
// To achieve 1.0 line spacing, use:
lineHeight: 0.5

// To achieve 1.2 line spacing, use:
lineHeight: 0.6

// To achieve 2.0 line spacing, use:
lineHeight: 1.0
```

#### Long-term Solution

The proper fix requires implementing scale-aware line height calculations that account for the CSS scaling factor:

```typescript
// Proposed fix (not yet implemented)
const screenScale = this.getScreenScaleFactor();
const lineY = wordIndex * params.fontSize * params.lineHeight / screenScale;
```

#### Related Issues

- CSS scaling inconsistency between logical and display coordinates
- devicePixelRatio consideration (resolved in v0.4.3 by removal of unused code)

---

## Parameter Range Issues

### PARAM-RANGE-001: wordSpacing Parameter Minimum Value

**Status**: Fixed in v0.4.3  
**Affected Components**: All templates using wordSpacing  
**Severity**: Low  

#### Problem Description

The wordSpacing parameter had a minimum value of 0.0, which could cause words to overlap or create layout issues.

#### Solution

Changed minimum value from 0.0 to 0.1 to ensure minimum spacing between words.

#### Fixed Files

- `/src/renderer/utils/ParameterRegistry.ts`: Standard parameter definition
- `/src/renderer/templates/GlitchTextPrimitive.ts`: Direct parameter definition
- `/src/renderer/templates/HierarchicalWordSlideTextPrimitive.ts`: Direct parameter definition  
- `/src/renderer/templates/WordSlideTextPrimitive.ts`: Direct parameter definition
- `/src/renderer/templates/PurePrimitiveWordSlideText.ts`: Direct parameter definition

---

## Reporting New Issues

When reporting new issues, please include:

1. **UTAVISTA Version**
2. **Affected Components/Templates**
3. **Steps to Reproduce**
4. **Expected vs Actual Behavior**
5. **System Environment** (OS, display resolution, devicePixelRatio)

Issues should be documented in this file with a unique identifier (e.g., LINE-HEIGHT-002) for tracking purposes.