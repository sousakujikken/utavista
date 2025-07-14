import * as PIXI from 'pixi.js';

/**
 * PIXIコンテナの階層構造とスケーリング状態を診断するためのユーティリティクラス
 */
export class ContainerDiagnostics {
  /**
   * コンテナ階層のスケール状態を診断するメソッド
   */
  static diagnosisContainerScaling(container: PIXI.Container, depth: number = 0, prefix: string = ''): void {
    // インデント用の空白
    const indent = '  '.repeat(depth);
    const containerName = (container as any).name || 'unnamed';
    const containerScale = container.scale;
    const worldTransform = container.worldTransform || {};
    
    
    // 子コンテナの再帰的診断
    if (container.children?.length > 0) {
      let phraseCount = 0;
      let wordCount = 0;
      let charCount = 0;
      let textCount = 0;
      
      container.children.forEach((child, index) => {
        if (child instanceof PIXI.Container) {
          const childName = (child as any).name || '';
          
          if (childName.includes('phrase_container_')) {
            if (phraseCount < 2) { // 最初の2つのフレーズだけ詳細に調査
              this.diagnosisContainerScaling(child, depth + 1, `Phrase[${index}]: `);
            }
            phraseCount++;
          } else if (childName.includes('word_container_')) {
            if (wordCount < 2) { // 最初の2つの単語だけ詳細に調査
              this.diagnosisContainerScaling(child, depth + 1, `Word[${index}]: `);
            }
            wordCount++;
          } else if (childName.includes('char_container_')) {
            if (charCount < 2) { // 最初の2つの文字だけ詳細に調査
              this.diagnosisContainerScaling(child, depth + 1, `Char[${index}]: `);
            }
            charCount++;
          } else {
            // その他のコンテナ
            this.diagnosisContainerScaling(child, depth + 1, `Other[${index}]: `);
          }
        } else if (child instanceof PIXI.Text) {
          // テキスト要素の診断
          if (textCount < 3) { // 最初の3つのテキスト要素だけ表示
          }
          textCount++;
        }
      });
      
      // カウント情報を表示
      if (phraseCount > 2 || wordCount > 2 || charCount > 2 || textCount > 3) {
                     `${wordCount > 2 ? wordCount - 2 : 0} more words, ` +
                     `${charCount > 2 ? charCount - 2 : 0} more chars, ` +
                     `${textCount > 3 ? textCount - 3 : 0} more texts.`);
      }
    }
  }
}