import {digest} from './dependency-inventory.mjs';
// Bind all selected bytes and release-state decisions, except the review stamp
// itself. Hashing that stamp into its own expected value would never converge.
export function sourceReviewHash(manifest,state){
 const normalized=Buffer.from(JSON.stringify({...state,reviewedSourceManifestSHA256:null})+'\n');
 const files=manifest.files.map(file=>file.path==='legal/release-state.json'?{...file,bytes:normalized.length,sha256:digest(normalized)}:file);
 return digest(JSON.stringify({...manifest,files}));
}
