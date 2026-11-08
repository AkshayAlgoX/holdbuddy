# Third-Party Notices & Asset Licenses

This document details the licensing, copyrights, and intellectual property conditions of third-party software, fonts, speech models, and synthetic audio assets utilized in the HoldBuddy project.

---

## 1. Original Source Code License
Original HoldBuddy source code (packages in `packages/`, server code in `server/`, web application in `apps/web/`, and scripts in `scripts/`) is licensed under the [Apache License, Version 2.0](./LICENSE).

---

## 2. Speech Audio Assets (`assets/*.wav`)

### A. Genuine Gnani Timbre v3.0 Neural Voice (`prompt-02.wav` through `prompt-07.wav`)
- **Model:** Gnani Timbre v3.0 (Voice: Shivani - Hindi Neural Voice)
- **Provider:** Gnani Innovations Private Limited (https://gnani.ai)
- **Provenance:** Generated using Gnani AI API platform (`app.gnani.ai/voice`) under authorized programme credits for the **Great Indian AI Internship Challenge 2026**.
- **Distribution Condition:** These audio files represent proprietary model outputs of Gnani Innovations Private Limited. The repository owner has confirmed authorized public distribution solely for the purposes of the competition demonstration and evaluation. **These files are NOT licensed under Apache 2.0.** All rights in the underlying voice models and trademarks remain the property of Gnani Innovations Private Limited.

### B. Synthetic Fallback Voice Audio (`prompt-01.wav`, `prompt-08.wav` through `prompt-14.wav`)
- **Model:** Kokoro-82M by hexgrad (https://huggingface.co/hexgrad/Kokoro-82M)
- **License:** Apache License, Version 2.0
- **Runtime:** `kokoro-onnx` (MIT License)

---

## 3. Webfonts (`@fontsource-variable/*` and `@fontsource/*`)

The client interface bundles variable open-source fonts for Indic script rendering:
- **Anek Bangla, Devanagari, Gujarati, Gurmukhi, Kannada, Latin, Malayalam, Tamil, Telugu:**
  - Copyright 2021 The Anek Project Authors (https://github.com/EkType/Anek)
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
- **JetBrains Mono:**
  - Copyright 2020 JetBrains s.r.o.
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)
- **Instrument Serif:**
  - Copyright 2022 Instrument Co (https://github.com/Instrument/instrument-serif)
  - License: SIL Open Font License, Version 1.1 (OFL-1.1)

---

## 4. Software Dependencies

- **React & React DOM:** MIT License (Copyright Meta Platforms, Inc.)
- **Vite & @vitejs/plugin-react:** MIT License (Copyright VoidZero Inc. & Vite Contributors)
- **TypeScript:** Apache License 2.0 (Copyright Microsoft Corporation)
- **Playwright:** Apache License 2.0 (Copyright Microsoft Corporation)
