// Use the Markdown syntax tree, not delimiter regexes: code spans may contain
// backticks, emphasis may nest, and escaped markers must remain literal.
export function inlineStyles(tree,from=0,to=tree.length){
 const spans=[];
 tree.iterate({from,to,enter(node){
  if(['FencedCode','CodeBlock','Table','Image','HTMLBlock','LinkReference'].includes(node.name))return false;
  const role={StrongEmphasis:'strong',Emphasis:'emphasis',InlineCode:'inline-code',Strikethrough:'strike'}[node.name];
  if(!role)return;
  const marks=node.node.getChildren(role==='inline-code'?'CodeMark':role==='strike'?'StrikethroughMark':'EmphasisMark');
  if(marks.length<2)return;
  spans.push({from:marks[0].to,to:marks.at(-1).from,role});
  for(const mark of marks)spans.push({from:mark.from,to:mark.to,role:'marker'});
  // Code-span contents are literal; do not interpret nested delimiters.
  if(role==='inline-code')return false;
 }});
 return spans.filter(span=>span.to>span.from);
}
