// This validates recorded review evidence, not legal correctness or bit-identical
// reconstruction. A guessed tag alone must not clear the binary-source gate.
export function elkSourceReviewRecorded(source,noticeHash,componentsHash){
 return /^[a-f0-9]{40}$/.test(source.elkJavaRevision||'')&&/^[a-f0-9]{40}$/.test(source.elkJavaPatchCommit||'')&&source.upstreamReleaseURL===`https://github.com/kieler/elkjs/releases/tag/${source.version}`&&source.preferredSourceStatus==='reviewed-java-source-and-build-inputs'&&/^[a-f0-9]{64}$/.test(source.javaBuildInputsNoticeSHA256||'')&&source.javaBuildInputsNoticeSHA256===noticeHash&&/^[a-f0-9]{64}$/.test(source.javaComponentsSHA256||'')&&source.javaComponentsSHA256===componentsHash;
}
