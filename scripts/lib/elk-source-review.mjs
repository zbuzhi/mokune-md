// This validates recorded review evidence, not legal correctness or bit-identical
// reconstruction. A guessed tag alone must not clear the binary-source gate.
export function elkSourceReviewRecorded(source,noticeHash){
 return /^[a-f0-9]{40}$/.test(source.elkJavaRevision||'')&&source.preferredSourceStatus==='reviewed-java-source-and-build-inputs'&&/^[a-f0-9]{64}$/.test(source.javaBuildInputsNoticeSHA256||'')&&source.javaBuildInputsNoticeSHA256===noticeHash;
}
