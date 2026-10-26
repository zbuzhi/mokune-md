const section='## 实现与思考\n\n保持中文输入、原样保存与独立撤销。 Rust makes reliable tools.\n\n- 可读的文稿\n- 可追溯的变化\n\n```rust\nfn main() { println!("hello"); }\n```\n\n';
export const fixtures={
 plain:'# 大文稿\n\n'+section.repeat(Math.ceil(1000000/new TextEncoder().encode(section).length)),
 math:'# 密集公式\n\n'+('正文 $x^2+y^2$，$z_i$。\n').repeat(10000),
 tables:'# 密集表格\n\n'+Array.from({length:250},(_,i)=>`## 表格 ${i}\n\n| A | B | C |\n| :--- | ---: | :---: |\n| **中文 ${i}** | code | 保留 |\n| 第二行 | 数据 | 原文 |\n\n`).join(''),
 diagrams:'# 密集图表\n\n'+Array.from({length:60},(_,i)=>`## 图表 ${i}\n\n\`\`\`mermaid\ngraph LR\nA[输入 ${i}] --> B[验证] --> C[保留原文]\n\`\`\`\n\n$$x_${i}^2+y^2$$\n\n`).join('')
};
