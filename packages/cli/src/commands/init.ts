import { Command } from "commander";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { log, logError } from "../utils.js";
import { initializeProjectDirectory } from "../project-bootstrap.js";

export const initCommand = new Command("init")
  .description("Initialize an InkOS project (current directory by default)")
  .argument("[name]", "Project name (creates subdirectory). Omit to init current directory.")
  .option("--lang <language>", "Project/UI language: zh (Chinese) or en (English). Omit for the default Vietnamese-UI project (books are still written in English or Chinese; Vietnamese is UI-only).")
  .action(async (name: string | undefined, opts: { lang?: string }) => {
    const projectDir = name ? resolve(process.cwd(), name) : process.cwd();
    const language = opts.lang === "en" ? "en" : opts.lang === "zh" ? "zh" : undefined;

    try {
      await mkdir(projectDir, { recursive: true });
      await initializeProjectDirectory(projectDir, {
        language,
        overwriteSupportFiles: true,
      });

      log(`Project initialized at ${projectDir}`);
      log("");
      // The project/UI language (opts.lang) and the book's writing language are
      // different things: a default ("vi") project has a Vietnamese UI but its
      // books are still written in English (Vietnamese is UI-only, never a
      // writing language), so the example below must not use a Vietnamese title.
      const exampleCreateLines = opts.lang === "en"
        ? ["  inkos book create --title 'My Novel' --genre progression --platform royalroad --lang en"]
        : opts.lang === "zh"
          ? [
            "  inkos book create --title '我的小说' --genre xuanhuan --platform tomato --lang zh",
            "  # English project? Re-run with: inkos init --lang en",
          ]
          : [
            "  inkos book create --title 'My Novel' --genre progression --platform royalroad",
            "  # Muốn dự án tiếng Trung? Chạy lại với: inkos init --lang zh",
          ];
      if (global) {
        log("Global LLM config detected. Ready to go!");
        log("");
        log("Next steps:");
        if (name) log(`  cd ${name}`);
        for (const line of exampleCreateLines) log(line);
      } else {
        log("Next steps:");
        if (name) log(`  cd ${name}`);
        log("  # Option 1: Set global config (recommended, one-time):");
        log("  inkos config set-global --provider openai --base-url <your-api-url> --api-key <your-key> --model <your-model>");
        log("  # Option 2: Edit .env for this project only");
        log("");
        for (const line of exampleCreateLines) log(line);
      }
      log("  inkos write next <book-id>");
    } catch (e) {
      logError(`Failed to initialize project: ${e}`);
      process.exit(1);
    }
  });
