# Third-party source availability

Mokune MD project-authored source uses MIT. Third-party licenses remain separate; full notices and the component inventory are in THIRD_PARTY_NOTICES.md and legal/sbom.cdx.json.

## ELK / elkjs 0.9.3

Mermaid includes the unmodified npm file `elkjs/lib/elk.bundled.js`, bundled/minified by this project. ELK retains EPL-2.0; the project license does not limit recipients' EPL source rights.

The [official 0.9.3 release](https://github.com/kieler/elkjs/releases/tag/0.9.3) identifies ELK 0.9.1 plus [PR 955](https://github.com/eclipse-elk/elk/pull/955):

- Java base: `62d5909f96fad541bc101ad52dabaece6b7eab7e`, https://codeload.github.com/eclipse-elk/elk/tar.gz/62d5909f96fad541bc101ad52dabaece6b7eab7e
- Java patch: `7ca51784e42a24201f29bc13e458728b6fc61cdc`, https://github.com/eclipse-elk/elk/commit/7ca51784e42a24201f29bc13e458728b6fc61cdc.diff
- Wrapper/Java overrides/GWT build configuration: https://codeload.github.com/kieler/elkjs/tar.gz/a8304cf79fde75bc2ab1a89d28320f53f8637436
- Wrapper archive SHA256: `850418c89dd35dbd94ea0100a7becbc09d320c153fda4c4ea4a88c67e12121a9`
- Original bundled file SHA256: `b0745abd7f23cd91690a1587e377edbe19fd7233c783300290936720546216d4`

Extract the Java base, apply the patch with `git apply`, and place that source tree next to the wrapper tree following its README. The patch applies to the base and its behavior is present in the upstream uncompressed worker. Source/build review details are in legal/elk-java-build-inputs.md; all source artifact URLs and hashes are in legal/elk-java-components.json.

## Embedded Java-origin families

The transpiled bundle also contains GWT/JRE emulation, Guava, EMF and Xbase contributions. These do not require a Java installation to run Mokune MD.

- GWT 2.10.0 and Guava 31.1-jre: Apache-2.0.
- EMF-GWT common/ecore 2.12.4: **EPL-1.0**, retained independently of ELK's EPL-2.0.
- Xtext/Xtend source support 2.28.0: EPL-2.0; source containers include classes that may be removed during transpilation.

Full original Maven source containers, headers and notices are obtained by `node scripts/fetch-elk-sources.mjs`. Public binary releases should include the resulting `third-party-sources.zip`. Source URLs remain usable independently of that attachment. Full EPL-1.0 and component notices are in licenses/EPL-1.0.txt and licenses/elk-java-notices.txt.

The historical build's MELK compiler uses 0.10.0-SNAPSHOT and JCenter. No byte-for-byte rebuild or exact recovery of that historical build-tool snapshot is claimed. Preferred source availability and original notices have been reviewed separately from reproducible-build limitations.

## Other components

- npm scope and integrity: legal/dependencies.json; application/runtime/font/theme inventory: legal/sbom.cdx.json.
- Theme sources: vendor/themes/sources.json and legal/theme-provenance.json.
- KaTeX and unmodified fonts: https://github.com/KaTeX/KaTeX; licenses/OFL-1.1.txt.
- Sparkle version, distribution hash and full notices: legal/sparkle.json and licenses/Sparkle-2.10.1.txt.

These records describe source and license evidence, not a worldwide trademark, patent or legal clearance.
