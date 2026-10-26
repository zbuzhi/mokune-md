# Third-party source availability

Mokune MD project-authored source is provided under MIT. This does not replace third-party licenses. Full texts, selected dual-license options and runtime/build scope appear in THIRD_PARTY_NOTICES.md and legal/sbom.cdx.json.

## ELK / elkjs 0.9.3 — EPL-2.0

Mermaid includes the unmodified npm file `elkjs/lib/elk.bundled.js`. It is bundled/minified by `scripts/build-web.mjs`; its license remains EPL-2.0. No restriction in the application license limits recipients' EPL source rights.

- Pinned wrapper/source/build-script repository: https://github.com/kieler/elkjs/tree/a8304cf79fde75bc2ab1a89d28320f53f8637436
- Archive: https://codeload.github.com/kieler/elkjs/tar.gz/a8304cf79fde75bc2ab1a89d28320f53f8637436
- SHA-256: `850418c89dd35dbd94ea0100a7becbc09d320c153fda4c4ea4a88c67e12121a9`
- License: https://github.com/kieler/elkjs/blob/a8304cf79fde75bc2ab1a89d28320f53f8637436/LICENSE.md
- Local bundled file SHA-256: `b0745abd7f23cd91690a1587e377edbe19fd7233c783300290936720546216d4`

The local npm bundle was matched to upstream Git blob `5e77ca50087cf50f52eeb732490fbe33d9eaf8c8`. The verified archive contains Java/JS wrapper sources, additional Java/Xtend changes, Gradle/GWT configuration, typings, tests and generated files. It is cached under `.build/license-evidence/` for local release preparation, not silently added to the project source archive.

**Public binary source review is still pending.** The upstream build requires a sibling checkout of https://github.com/eclipse/elk and instructs choosing the corresponding ELK release. The tagged build script does not pin that Java repository revision and declares a `0.10.0-SNAPSHOT` meta-language dependency. A matching wrapper archive/generated JS does not prove the preferred Java sources and complete build inputs corresponding to the npm artifact. The tagged Gradle build also references GWT, Guava, EMF/GWT and Xtend/Xtext; their embedded/generated contributions and notices require verification with that source set. The npm-package SBOM alone does not enumerate every Java-origin component inside the transpiled bundle. `legal/elk-source.json` records this uncertainty explicitly. Do not substitute a guessed Java tag or claim the source obligation has been fully cleared.

Before a public binary release, verify and document the matching Java source/build input set (and provide a reasonable stable source acquisition route or source materials), or separately evaluate an implementation change without removing existing diagram support. The public-binary gate fails while this item is unverified. Publishing only this project's source, lockfile and instructions is evaluated separately from distributing bundled ELK object code.

## Other components

- Runtime and font component list: legal/sbom.cdx.json; lockfile tarball integrity and license file hashes: legal/dependencies.json.
- Community theme sources: vendor/themes/sources.json; verified upstream byte hashes: legal/theme-provenance.json.
- KaTeX source: https://github.com/KaTeX/KaTeX — version pinned by pnpm-lock.yaml; unmodified embedded font hashes are in the SBOM. OFL-1.1 text is in licenses/OFL-1.1.txt.

This statement describes the available engineering evidence. It is not a trademark, patent or jurisdiction-wide legal clearance.
