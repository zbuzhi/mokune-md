// GitHub alerts: a dedicated first line in a top-level blockquote. Keep unknown
// types, escaped markers, inline examples and nested quotes as ordinary source.
export const calloutTypes=['NOTE','TIP','IMPORTANT','WARNING','CAUTION'];
export function calloutPlugin(md){
  md.core.ruler.before('inline','mokune-callouts',state=>{
    state.env.callouts=[];
    for(let i=0;i<state.tokens.length;i++){
      const quote=state.tokens[i],paragraph=state.tokens[i+1],inline=state.tokens[i+2];
      if(quote.type!=='blockquote_open'||quote.level!==0||paragraph?.type!=='paragraph_open'||inline?.type!=='inline')continue;
      const match=inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i);
      if(!match)continue;
      const type=match[1].toUpperCase();
      quote.attrJoin('class',`md-callout callout-${type.toLowerCase()}`);
      state.env.callouts.push({type,startLine:quote.map[0],endLine:quote.map[1]});
      inline.content=inline.content.slice(match[0].length);
      // Footnote source tracking must refer to the body, not the marker line.
      if(inline.map)inline.map=[inline.map[0]+1,inline.map[1]];
      if(!inline.content){paragraph.hidden=true;state.tokens[i+3].hidden=true;}
      const title=new state.Token('mokune_callout_title','p',0);title.meta={type};title.block=true;
      state.tokens.splice(i+1,0,title);i++;
    }
  });
  md.renderer.rules.mokune_callout_title=(tokens,i)=>`<p class="callout-title">${tokens[i].meta.type}</p>\n`;
}
