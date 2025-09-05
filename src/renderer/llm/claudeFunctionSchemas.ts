/**
 * Claude Function Calling スキーマ定義
 * LLMテンプレート生成システム v2.0
 */

/**
 * テンプレート生成用Claude Function定義
 * 自然言語指示を構造化データに変換
 */
export const generateLyricTemplateFunction = {
  name: "generate_lyric_template",
  description: "Generate a lyric animation template based on natural language description. Creates a complete IAnimationTemplate with cooperative hierarchy control.",
  parameters: {
    type: "object",
    properties: {
      templateName: {
        type: "string",
        description: "Name for the generated template"
      },
      entryAnimation: {
        type: "object",
        description: "Animation for text entrance",
        properties: {
          type: { 
            type: "string", 
            enum: ["slide", "fade", "reveal", "bounce", "none"],
            description: "Type of entrance animation"
          },
          direction: { 
            type: "string", 
            enum: ["left", "right", "top", "bottom"],
            description: "Direction for slide animations"
          },
          sequencing: { 
            type: "string", 
            enum: ["simultaneous", "sequential", "random"],
            description: "How characters/words appear"
          },
          duration: { 
            type: "number", 
            minimum: 100, 
            maximum: 5000,
            description: "Animation duration in milliseconds"
          },
          speed: {
            type: "string",
            enum: ["slow", "normal", "fast"],
            description: "Animation speed preset"
          },
          physics: {
            type: "object",
            description: "Physics-based animation parameters",
            properties: {
              initialSpeed: { type: "number", minimum: 0.1, maximum: 20.0 },
              finalSpeed: { type: "number", minimum: 0.01, maximum: 2.0 },
              elasticity: { type: "number", minimum: 0.0, maximum: 1.0 }
            }
          }
        },
        required: ["type"]
      },
      layoutPattern: {
        type: "object",
        description: "How text is arranged and positioned",
        properties: {
          arrangement: { 
            type: "string", 
            enum: ["cumulative", "grid", "circular", "scattered"],
            description: "Text layout arrangement pattern"
          },
          spacing: { 
            type: "number", 
            minimum: 0.1, 
            maximum: 3.0,
            description: "Character spacing multiplier"
          },
          alignment: { 
            type: "string", 
            enum: ["left", "center", "right"],
            description: "Text alignment"
          },
          positioning: {
            type: "object",
            description: "Position offsets and adjustments",
            properties: {
              offsetX: { type: "number", minimum: -500, maximum: 500 },
              offsetY: { type: "number", minimum: -500, maximum: 500 },
              randomPlacement: { type: "boolean" },
              randomRange: {
                type: "object",
                properties: {
                  x: { type: "number", minimum: 0, maximum: 800 },
                  y: { type: "number", minimum: 0, maximum: 600 }
                }
              }
            }
          }
        },
        required: ["arrangement", "spacing"]
      },
      effects: {
        type: "array",
        description: "Visual effects to apply",
        items: {
          type: "object",
          properties: {
            type: { 
              type: "string", 
              enum: ["glow", "shadow", "blur", "distortion", "none"],
              description: "Type of visual effect"
            },
            intensity: { 
              type: "string",
              enum: ["subtle", "normal", "dramatic"],
              description: "Effect intensity level"
            },
            color: { 
              type: "string", 
              pattern: "^#[0-9A-Fa-f]{6}$",
              description: "Color for the effect (hex format)"
            },
            parameters: {
              type: "object",
              description: "Effect-specific parameters",
              properties: {
                blur: { type: "number", minimum: 0, maximum: 20 },
                brightness: { type: "number", minimum: 0.5, maximum: 3.0 },
                distance: { type: "number", minimum: 0, maximum: 100 },
                angle: { type: "number", minimum: 0, maximum: 360 }
              }
            }
          },
          required: ["type", "intensity"]
        }
      },
      exitAnimation: {
        type: "object",
        description: "Animation for text exit",
        properties: {
          type: { 
            type: "string", 
            enum: ["fade", "slide", "shrink", "explode", "none"],
            description: "Type of exit animation"
          },
          direction: { 
            type: "string", 
            enum: ["left", "right", "top", "bottom"],
            description: "Direction for slide exit"
          },
          duration: { 
            type: "number", 
            minimum: 100, 
            maximum: 5000,
            description: "Exit animation duration in milliseconds"
          }
        }
      },
      timing: {
        type: "object",
        description: "Timing and synchronization settings",
        properties: {
          headTime: { 
            type: "number", 
            minimum: 0, 
            maximum: 2000,
            description: "Lead time before text appears (ms)"
          },
          tailTime: { 
            type: "number", 
            minimum: 0, 
            maximum: 2000,
            description: "Time after text before exit (ms)"
          },
          characterDelay: {
            type: "number",
            minimum: 0,
            maximum: 500,
            description: "Delay between character appearances (ms)"
          }
        }
      },
      styling: {
        type: "object",
        description: "Text styling and appearance",
        properties: {
          fontSize: { 
            type: "number", 
            minimum: 12, 
            maximum: 256,
            description: "Font size in pixels"
          },
          fontFamily: {
            type: "string",
            description: "Font family name"
          },
          colors: {
            type: "object",
            description: "Text color states",
            properties: {
              default: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              active: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              completed: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }
            }
          },
          blendMode: {
            type: "string",
            enum: ["normal", "add", "multiply", "screen", "overlay", "darken", "lighten"],
            description: "Blend mode for text rendering"
          }
        }
      }
    },
    required: ["templateName", "entryAnimation", "layoutPattern"]
  }
};

/**
 * テンプレート改善用Claude Function定義
 * 既存テンプレートの修正・改善指示
 */
export const improveTemplateFunction = {
  name: "improve_template",
  description: "Improve or modify an existing template based on user feedback",
  parameters: {
    type: "object",
    properties: {
      currentTemplate: {
        type: "string",
        description: "Name of the current template to improve"
      },
      improvementAreas: {
        type: "array",
        items: {
          type: "string",
          enum: ["animation", "effects", "timing", "layout", "styling", "performance"]
        },
        description: "Areas to focus improvements on"
      },
      specificChanges: {
        type: "object",
        description: "Specific parameter changes requested",
        properties: {
          increaseSpeed: { type: "boolean" },
          decreaseSpeed: { type: "boolean" },
          addGlow: { type: "boolean" },
          removeGlow: { type: "boolean" },
          changeDirection: { 
            type: "string", 
            enum: ["left", "right", "top", "bottom"] 
          },
          adjustIntensity: {
            type: "string",
            enum: ["increase", "decrease"]
          }
        }
      },
      userFeedback: {
        type: "string",
        description: "Natural language feedback from the user"
      }
    },
    required: ["currentTemplate", "userFeedback"]
  }
};

/**
 * アニメーション分析用Claude Function定義
 * 既存テンプレートの分析・説明
 */
export const analyzeAnimationFunction = {
  name: "analyze_animation",
  description: "Analyze and explain how an animation template works",
  parameters: {
    type: "object",
    properties: {
      templateName: {
        type: "string",
        description: "Name of the template to analyze"
      },
      analysisType: {
        type: "string",
        enum: ["structure", "parameters", "performance", "visual-effects", "timing"],
        description: "Type of analysis to perform"
      },
      detailLevel: {
        type: "string",
        enum: ["summary", "detailed", "technical"],
        description: "Level of detail for the analysis"
      }
    },
    required: ["templateName", "analysisType"]
  }
};

/**
 * プリミティブ選択用Claude Function定義
 * 自然言語から適切なプリミティブの組み合わせを選択
 */
export const selectPrimitivesFunction = {
  name: "select_primitives",
  description: "Select appropriate primitives for a natural language animation description",
  parameters: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Natural language description of the desired animation"
      },
      primitiveSelection: {
        type: "object",
        description: "Selected primitives and their configurations",
        properties: {
          layout: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["cumulative", "grid", "circular"] },
              parameters: { type: "object" }
            }
          },
          animation: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["slide", "fade", "reveal", "bounce"] },
              parameters: { type: "object" }
            }
          },
          effects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["glow", "shadow", "blur"] },
                parameters: { type: "object" }
              }
            }
          }
        }
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence level in the primitive selection"
      }
    },
    required: ["description", "primitiveSelection"]
  }
};

/**
 * 全Claude Function定義の統合エクスポート
 */
export const claudeFunctionSchemas = {
  generateLyricTemplate: generateLyricTemplateFunction,
  improveTemplate: improveTemplateFunction,
  analyzeAnimation: analyzeAnimationFunction,
  selectPrimitives: selectPrimitivesFunction
};

/**
 * Function Calling結果の型定義
 */
export interface GenerateLyricTemplateResult {
  templateName: string;
  entryAnimation: {
    type: string;
    direction?: string;
    sequencing: string;
    duration: number;
    speed?: string;
    physics?: {
      initialSpeed?: number;
      finalSpeed?: number;
      elasticity?: number;
    };
  };
  layoutPattern: {
    arrangement: string;
    spacing: number;
    alignment: string;
    positioning?: {
      offsetX?: number;
      offsetY?: number;
      randomPlacement?: boolean;
      randomRange?: { x: number; y: number };
    };
  };
  effects?: Array<{
    type: string;
    intensity: string;
    color?: string;
    parameters?: Record<string, number>;
  }>;
  exitAnimation?: {
    type: string;
    direction?: string;
    duration: number;
  };
  timing?: {
    headTime?: number;
    tailTime?: number;
    characterDelay?: number;
  };
  styling?: {
    fontSize?: number;
    fontFamily?: string;
    colors?: {
      default?: string;
      active?: string;
      completed?: string;
    };
    blendMode?: string;
  };
}

export interface ImproveTemplateResult {
  currentTemplate: string;
  improvementAreas: string[];
  specificChanges?: Record<string, boolean | string>;
  userFeedback: string;
}

export interface AnalyzeAnimationResult {
  templateName: string;
  analysisType: string;
  detailLevel: string;
}

export interface SelectPrimitivesResult {
  description: string;
  primitiveSelection: {
    layout?: {
      type: string;
      parameters: Record<string, unknown>;
    };
    animation?: {
      type: string;
      parameters: Record<string, unknown>;
    };
    effects?: Array<{
      type: string;
      parameters: Record<string, unknown>;
    }>;
  };
  confidence: number;
}