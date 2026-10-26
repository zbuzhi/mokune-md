export function releaseReadiness(state,audit,sourceManifestHash,evidence={}){
 const source=[];
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(state.repository||''))source.push('真实 GitHub owner/repo 待定');
 if(!state.copyrightHolder?.trim()||state.rightsConfirmed!==true)source.push('版权署名主体与贡献/职务作品权限尚未确认');
 if(state.brandReviewComplete!==true)source.push('Mokune MD 名称及 MD7 图形近似商标复核未完成');
 if(!state.privateSecurityContact?.trim()||state.privateSecurityContactVerified!==true)source.push('私密安全报告渠道未配置/验证');
 if(state.reviewedSourceManifestSHA256!==sourceManifestHash)source.push('当前精确源代码清单尚未人工确认');
 const binary=[...source,...audit.binaryBlockers];if(state.longTermBundleIdentityConfirmed!==true)binary.push('长期 bundle ID/发行身份未确认');if(!evidence.developerID||!evidence.hardenedRuntime||!evidence.signatureVerified||!evidence.stapledTicketValidated)binary.push('Developer ID、Hardened Runtime、公证票据与签名验证未全部通过');
 return {sourceReady:source.length===0,publicBinaryReady:binary.length===0,sourceBlockers:source,binaryBlockers:binary};
}
