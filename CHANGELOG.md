# Changelog

## [0.11.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.10.1...v0.11.0) (2026-11-03)


### Features

* **lint:** enforce the boolean naming convention with naming-convention ([#285](https://github.com/zizzfizzix/scrape-similar/issues/285)) ([61507ee](https://github.com/zizzfizzix/scrape-similar/commit/61507eec5fa8bf39c4bd4b35dbff94b74e7783a0))
* **lint:** settle the three deferred testing-library rules ([#288](https://github.com/zizzfizzix/scrape-similar/issues/288)) ([8cffa7d](https://github.com/zizzfizzix/scrape-similar/commit/8cffa7d7e934b5f25854f9e7bfd57d98f48db469))
* **manifest:** serve web accessible resources via dynamic URLs ([#242](https://github.com/zizzfizzix/scrape-similar/issues/242)) ([8127c80](https://github.com/zizzfizzix/scrape-similar/commit/8127c80703064e16d9f763209d6f5fa99ab55363))
* **sidepanel:** give each tab its own side panel instance ([#353](https://github.com/zizzfizzix/scrape-similar/issues/353)) ([88295e5](https://github.com/zizzfizzix/scrape-similar/commit/88295e55c0f570ffa1db0bc352841e46d5198737))
* **types:** adopt noUncheckedIndexedAccess and noImplicitOverride ([#255](https://github.com/zizzfizzix/scrape-similar/issues/255)) ([a112761](https://github.com/zizzfizzix/scrape-similar/commit/a11276141ce17de02b3bbb7b4f08f52da541038c)), closes [#245](https://github.com/zizzfizzix/scrape-similar/issues/245)


### Bug Fixes

* **analytics:** remember a background posthog init that cannot succeed ([#413](https://github.com/zizzfizzix/scrape-similar/issues/413)) ([20ff267](https://github.com/zizzfizzix/scrape-similar/commit/20ff2679d18fbebe2cdb719504f92cd8cdb1d478))
* **analytics:** retire the ui posthog instance when consent is declined ([#366](https://github.com/zizzfizzix/scrape-similar/issues/366)) ([ecb6cb4](https://github.com/zizzfizzix/scrape-similar/commit/ecb6cb41838ce7931029c1388e2889ae66d66467))
* **analytics:** stop callers setting the properties the pipeline adds ([#369](https://github.com/zizzfizzix/scrape-similar/issues/369)) ([7347524](https://github.com/zizzfizzix/scrape-similar/commit/734752439a725a8ec310e51380ac7302a7b4c641))
* close the side-panel attach races and the autosuggest blur race ([#267](https://github.com/zizzfizzix/scrape-similar/issues/267)) ([6871bba](https://github.com/zizzfizzix/scrape-similar/commit/6871bba8d3bba7c28ed7b1d383e803859f37e647))
* **config-form:** act on enter before reading storage ([#321](https://github.com/zizzfizzix/scrape-similar/issues/321)) ([63e0845](https://github.com/zizzfizzix/scrape-similar/commit/63e08453ec7a577145dbb330d5b29b3ab441d133))
* **config-form:** don't re-highlight an unchanged selector on blur ([#326](https://github.com/zizzfizzix/scrape-similar/issues/326)) ([7c619d6](https://github.com/zizzfizzix/scrape-similar/commit/7c619d657972492765ba8ce67d713593d252c7b1))
* **config-form:** keep focus on a validate press so a slow click validates ([#323](https://github.com/zizzfizzix/scrape-similar/issues/323)) ([cc103c1](https://github.com/zizzfizzix/scrape-similar/commit/cc103c18545cae4bc9df0cb8270e276edd556a26))
* **config-form:** leave keys to the IME while it is composing ([#322](https://github.com/zizzfizzix/scrape-similar/issues/322)) ([fbe74d6](https://github.com/zizzfizzix/scrape-similar/commit/fbe74d6c22ca059d05cb23875b9498e6c04bdd9b))
* **config-form:** track scrapes started with enter ([#330](https://github.com/zizzfizzix/scrape-similar/issues/330)) ([297d0cf](https://github.com/zizzfizzix/scrape-similar/commit/297d0cf87c3c8d1549bd31ac693d256cbb9eec3d))
* **content:** reply with a failure when a message handler throws ([#427](https://github.com/zizzfizzix/scrape-similar/issues/427)) ([ece0063](https://github.com/zizzfizzix/scrape-similar/commit/ece0063a09bd3c9067cb55b4deaa3c353752b49d))
* **picker:** build columns for the element the chosen selector matches ([#315](https://github.com/zizzfizzix/scrape-similar/issues/315)) ([fcc432c](https://github.com/zizzfizzix/scrape-similar/commit/fcc432c90fb215632796aefc722542276182a239))
* **picker:** drop banner and context menu mounts cancelled mid-await ([#407](https://github.com/zizzfizzix/scrape-similar/issues/407)) ([a48acbb](https://github.com/zizzfizzix/scrape-similar/commit/a48acbb60d9a892042f563f9bf0e2610b019449b))
* **picker:** resolve SVG targets to their nearest HTML ancestor ([#410](https://github.com/zizzfizzix/scrape-similar/issues/410)) ([569eee3](https://github.com/zizzfizzix/scrape-similar/commit/569eee3823aa29b13809e8caa1c0ea3a7b74f91b))
* **picker:** resolve the released-on element and ignore clicks on body/html ([#316](https://github.com/zizzfizzix/scrape-similar/issues/316)) ([7f45892](https://github.com/zizzfizzix/scrape-similar/commit/7f458923a44943cfc52f7ad0c3c0dff5c9282c58))
* **picker:** select only data rows at the table-row level ([#421](https://github.com/zizzfizzix/scrape-similar/issues/421)) ([5e4ede8](https://github.com/zizzfizzix/scrape-similar/commit/5e4ede86c45c3ccca35233a69e96318ca93e7d3d))
* **recents:** remember a selector only once it has matched elements ([#324](https://github.com/zizzfizzix/scrape-similar/issues/324)) ([3ee5768](https://github.com/zizzfizzix/scrape-similar/commit/3ee57682e514fb598e77cfe65a4edb4222239cd9))
* recognise the extension's own pages and browser on every build ([#372](https://github.com/zizzfizzix/scrape-similar/issues/372)) ([bef7c88](https://github.com/zizzfizzix/scrape-similar/commit/bef7c8831a4b48465fdf2ce1675c92db2338708d))
* **scrape:** match only a table's own rows in the table-row selector ([#424](https://github.com/zizzfizzix/scrape-similar/issues/424)) ([1fa6c8f](https://github.com/zizzfizzix/scrape-similar/commit/1fa6c8ff55a99bb06ba2e7c21d87c4f2a8eb926b))
* **scraper:** keep the last step when minimizing a unique element ([#428](https://github.com/zizzfizzix/scrape-similar/issues/428)) ([351e443](https://github.com/zizzfizzix/scrape-similar/commit/351e4439e6028598d665b9ecdde6333323ba9a82))
* **session-storage:** read and initialize tab state under one lock ([#335](https://github.com/zizzfizzix/scrape-similar/issues/335)) ([4212958](https://github.com/zizzfizzix/scrape-similar/commit/4212958429591d3e838b30f88f3635a6ee62aedc))
* **session-storage:** refuse side panel writes for closed tabs ([#348](https://github.com/zizzfizzix/scrape-similar/issues/348)) ([1589275](https://github.com/zizzfizzix/scrape-similar/commit/1589275dae74f9e45d4e23505308bfd736548f24))
* **sidepanel:** apply column edits as operations so they cannot overwrite newer columns ([#425](https://github.com/zizzfizzix/scrape-similar/issues/425)) ([98050b1](https://github.com/zizzfizzix/scrape-similar/commit/98050b103bbb4e679012ab6bd5d2ddd27ea49351))
* **sidepanel:** apply state written while the panel is starting up ([#262](https://github.com/zizzfizzix/scrape-similar/issues/262)) ([7a7318f](https://github.com/zizzfizzix/scrape-similar/commit/7a7318fb21ca05f9fbea98d51327c7f2d9163716))
* **sidepanel:** don't report "0 found" on the scrape button while validating ([#256](https://github.com/zizzfizzix/scrape-similar/issues/256)) ([0c7efee](https://github.com/zizzfizzix/scrape-similar/commit/0c7efee2329605d9c9423e856d27cefec0819569))
* **sidepanel:** persist only the config fields an edit changed ([#360](https://github.com/zizzfizzix/scrape-similar/issues/360)) ([602e170](https://github.com/zizzfizzix/scrape-similar/commit/602e1702ad558d51bf22eb229188c64f85b14928))
* **sidepanel:** reload presets once after save, delete and import ([#351](https://github.com/zizzfizzix/scrape-similar/issues/351)) ([ef520e2](https://github.com/zizzfizzix/scrape-similar/commit/ef520e2269bdbfd3a1b8595de9092cdfb16c52f1))
* **sidepanel:** reset validation state when the main selector is cleared ([#252](https://github.com/zizzfizzix/scrape-similar/issues/252)) ([6f0ccab](https://github.com/zizzfizzix/scrape-similar/commit/6f0ccab1b67634e4054e82be363013c050208ed6)), closes [#38](https://github.com/zizzfizzix/scrape-similar/issues/38)
* stop awaiting on one side of a branch, which miscounts coverage ([#275](https://github.com/zizzfizzix/scrape-similar/issues/275)) ([cbfc6e0](https://github.com/zizzfizzix/scrape-similar/commit/cbfc6e0b4b2b7612ea2670b41fa91efb9884743f))
* **storage:** drop non-string entries when reading recent selectors ([#332](https://github.com/zizzfizzix/scrape-similar/issues/332)) ([7b50f5c](https://github.com/zizzfizzix/scrape-similar/commit/7b50f5c220b2fadf367d803968d93c1ac9784c98))
* **storage:** serialise preset save, delete and import ([#337](https://github.com/zizzfizzix/scrape-similar/issues/337)) ([548700a](https://github.com/zizzfizzix/scrape-similar/commit/548700a1feabc2a4a890475993a8f72464ae38f6))
* **storage:** serialise recent selector updates ([#320](https://github.com/zizzfizzix/scrape-similar/issues/320)) ([d40ebd8](https://github.com/zizzfizzix/scrape-similar/commit/d40ebd8afab899f5d9938c6be135e20f768e6245))
* **storage:** serialise storage writes across extension contexts ([#342](https://github.com/zizzfizzix/scrape-similar/issues/342)) ([e3bc287](https://github.com/zizzfizzix/scrape-similar/commit/e3bc287339b2137c95d418d2a52a52f1d220c4c3))
* **test:** measure the whole codebase in the coverage gate ([#269](https://github.com/zizzfizzix/scrape-similar/issues/269)) ([b325ac9](https://github.com/zizzfizzix/scrape-similar/commit/b325ac96e2b8e47c923e3f798389d3b67f6e5b70))
* **theme:** apply the stored theme before the first paint ([#371](https://github.com/zizzfizzix/scrape-similar/issues/371)) ([d18b0ac](https://github.com/zizzfizzix/scrape-similar/commit/d18b0ac9702d691c3043bfa996a7416941a4534e))
* **theme:** apply the theme class in a layout effect ([#349](https://github.com/zizzfizzix/scrape-similar/issues/349)) ([ac56659](https://github.com/zizzfizzix/scrape-similar/commit/ac5665959e899c1cdd345fa39f9d4a7b843b4a08))
* validate the edited selector instead of scraping the old one ([#274](https://github.com/zizzfizzix/scrape-similar/issues/274)) ([4ce642a](https://github.com/zizzfizzix/scrape-similar/commit/4ce642a183ac1c0abe3aa588a4266b37c9e40cda))


### Performance Improvements

* **theme:** memoize the theme context value ([#363](https://github.com/zizzfizzix/scrape-similar/issues/363)) ([f3ea32c](https://github.com/zizzfizzix/scrape-similar/commit/f3ea32ca5fb13e976aa3c9e955416fd5b0d020d3))

## [0.10.1](https://github.com/zizzfizzix/scrape-similar/compare/v0.10.0...v0.10.1) (2026-04-25)


### Bug Fixes

* keep data table aligned with producing config after column delete ([#220](https://github.com/zizzfizzix/scrape-similar/issues/220)) ([9dbc5b5](https://github.com/zizzfizzix/scrape-similar/commit/9dbc5b51d106987476136ecdcce0bfa43a950214))

## [0.10.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.9.0...v0.10.0) (2026-03-11)


### Features

* **ci:** use github specific reporter for playwright ([#193](https://github.com/zizzfizzix/scrape-similar/issues/193)) ([47fb4bf](https://github.com/zizzfizzix/scrape-similar/commit/47fb4bf7bd17c4743d3a26e1994f73391ac7697f))


### Bug Fixes

* bump dependencies to fix vulnerabilities ([#201](https://github.com/zizzfizzix/scrape-similar/issues/201)) ([603df8d](https://github.com/zizzfizzix/scrape-similar/commit/603df8d4c10305dcf1a887bfd625f7513e9afe41))

## [0.9.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.8.0...v0.9.0) (2026-02-18)


### Features

* add user preset import and export  ([#185](https://github.com/zizzfizzix/scrape-similar/issues/185)) ([c7abf02](https://github.com/zizzfizzix/scrape-similar/commit/c7abf02dded717cfe2aef38156d96ea34e617e43))

## [0.8.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.7.0...v0.8.0) (2026-01-15)


### Features

* **dev:** add worktree setup hook ([#162](https://github.com/zizzfizzix/scrape-similar/issues/162)) ([6976050](https://github.com/zizzfizzix/scrape-similar/commit/69760506c3301c8c1c89aad32965ea3942e4e6bd))
* open feedback survey on uninstall ([#163](https://github.com/zizzfizzix/scrape-similar/issues/163)) ([398146c](https://github.com/zizzfizzix/scrape-similar/commit/398146c01651593a1d5f0fd82e5106cc43fd7a74))


### Bug Fixes

* code scanning alert no. 1: Workflow does not contain permissions ([#158](https://github.com/zizzfizzix/scrape-similar/issues/158)) ([4080e7e](https://github.com/zizzfizzix/scrape-similar/commit/4080e7ec4947eeaa6e8aa4599e5c350129e43960))
* code scanning alert no. 2: Workflow does not contain permissions ([#159](https://github.com/zizzfizzix/scrape-similar/issues/159)) ([f3e2f55](https://github.com/zizzfizzix/scrape-similar/commit/f3e2f55827d3c36efdfa82180b68c8243be05560))
* code scanning alert no. 3: Incomplete regular expression for hostnames ([#157](https://github.com/zizzfizzix/scrape-similar/issues/157)) ([8b1bb7e](https://github.com/zizzfizzix/scrape-similar/commit/8b1bb7e49f23e803cceb1e4a7a00f8e2aa07a0b3))
* mask input fields explicitly ([#148](https://github.com/zizzfizzix/scrape-similar/issues/148)) ([8f3cba9](https://github.com/zizzfizzix/scrape-similar/commit/8f3cba93ecd93541f8a5f6bf7511c3dfdf8a857d))

## [0.7.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.6.0...v0.7.0) (2025-12-27)


### Features

* [#61](https://github.com/zizzfizzix/scrape-similar/issues/61) visual selector picker ([#96](https://github.com/zizzfizzix/scrape-similar/issues/96)) ([36ff367](https://github.com/zizzfizzix/scrape-similar/commit/36ff367dd9ac27e07bd8f99f40b175e53e65eaeb))

## [0.6.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.5.0...v0.6.0) (2025-10-20)


### Features

* add xlsx export option ([#101](https://github.com/zizzfizzix/scrape-similar/issues/101)) ([c2aed01](https://github.com/zizzfizzix/scrape-similar/commit/c2aed01dc61d634936b5d8aa9900b849de085eb9))

## [0.5.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.4.0...v0.5.0) (2025-10-05)


### Features

* trigger a demo scrape at the end of onboarding ([#89](https://github.com/zizzfizzix/scrape-similar/issues/89)) ([f8cba85](https://github.com/zizzfizzix/scrape-similar/commit/f8cba85d46d2263397ab32d6d9566350cf1a5e47))


### Bug Fixes

* main selector reverted after autosuggest load on click ([#87](https://github.com/zizzfizzix/scrape-similar/issues/87)) ([0db7818](https://github.com/zizzfizzix/scrape-similar/commit/0db78183f81847b96d5660011caff2a89083adaf))

## [0.4.0](https://github.com/zizzfizzix/scrape-similar/compare/v0.3.3...v0.4.0) (2025-10-04)


### Features

* add main selector autosuggest drop-down with recents and presets ([#62](https://github.com/zizzfizzix/scrape-similar/issues/62)) ([2283c87](https://github.com/zizzfizzix/scrape-similar/commit/2283c874dbcb909977cc446b62cd01b19da51d56))
* theme setting button visual improvements ([#63](https://github.com/zizzfizzix/scrape-similar/issues/63)) ([12accca](https://github.com/zizzfizzix/scrape-similar/commit/12acccab9a80501c3133eaaba8f468dd34ed4d9f))


### Bug Fixes

* **ci:** Mismached playwright test and dlx playwright versions result in failing CI checks closes: [#83](https://github.com/zizzfizzix/scrape-similar/issues/83) ([#84](https://github.com/zizzfizzix/scrape-similar/issues/84)) ([9acc7eb](https://github.com/zizzfizzix/scrape-similar/commit/9acc7ebddd85d2880108b7adb64a0537c1188d2d))

## [0.3.3](https://github.com/zizzfizzix/scrape-similar/compare/v0.3.2...v0.3.3) (2025-09-08)


### Bug Fixes

* google sheets export doesn't work when google account language isn't English ([5bc057f](https://github.com/zizzfizzix/scrape-similar/commit/5bc057f3905b7d0c0f6d0c9d68d8a7247f344f65))
