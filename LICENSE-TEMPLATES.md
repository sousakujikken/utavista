# Template Licensing

## Dual Licensing Structure

UTAVISTA uses a dual licensing structure:

- **Main Application Code**: Licensed under GNU General Public License v3.0 (GPL-3.0)
- **Animation Templates**: Licensed under Creative Commons Attribution 4.0 International (CC-BY-4.0)

## Templates Under CC-BY-4.0

The following animation templates are licensed under CC-BY-4.0:

1. **MultiLineText** - Multi-line lyric display template
2. **FlickerFadeTemplate** - Random character flickering with fade effects
3. **GlitchText** - Digital glitch effect template
4. **WordSlideText** - Word slide-in with random positioning

## Attribution Requirements

When using or modifying CC-BY-4.0 licensed templates, you must:

1. Give appropriate credit to the original author
2. Provide a link to the CC-BY-4.0 license
3. Indicate if changes were made

## Creating New Templates

When creating new templates:

- Templates WITH metadata specifying CC-BY-4.0 → Licensed under CC-BY-4.0
- Templates WITHOUT license metadata → Licensed under GPL-3.0 (project default)

To license a template under CC-BY-4.0, include in your template metadata:

```typescript
metadata: {
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  originalAuthor: "Your Name"
}
```

## License Compatibility

CC-BY-4.0 is compatible with GPL-3.0. Templates licensed under CC-BY-4.0 can be included in the GPL-3.0 UTAVISTA project while maintaining their original CC-BY-4.0 license.

For more information:
- GPL-3.0: See LICENSE.txt
- CC-BY-4.0: See LICENSE-CC-BY-4.0.txt