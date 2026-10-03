(() => {
  "use strict";

  const JUDGE0_URL = "https://ce.judge0.com/submissions?base64_encoded=true&wait=true";
  const LANGUAGES = {
    cpp: { label: "C++", file: "main.cpp", mode: "text/x-c++src", id: 54, starter: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    cout << "Enter your name: ";
    cin >> name;
    cout << "Hello, " << name << "!" << endl;
    return 0;
}` },
    c: { label: "C", file: "main.c", mode: "text/x-csrc", id: 50, starter: `#include <stdio.h>

int main(void) {
    char name[100];
    printf("Enter your name: ");
    if (scanf("%99s", name) == 1) {
        printf("Hello, %s!\\n", name);
    }
    return 0;
}` },
    python: { label: "Python", file: "main.py", mode: "python", id: 71, starter: `name = input("Enter your name: ")
print(f"Hello, {name}!")` },
    java: { label: "Java", file: "Main.java", mode: "text/x-java", id: 62, starter: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        System.out.print("Enter your name: ");
        String name = input.nextLine();
        System.out.println("Hello, " + name + "!");
        input.close();
    }
}` }
  };

  const $ = (id) => document.getElementById(id);
  const languageSelect = $("language");
  const output = $("output");
  const status = $("status");
  const runButton = $("run");
  const stdin = $("stdin");
  let activeLanguage = languageSelect.value || "cpp";
  let isRunning = false;
  let toastTimer;

  const editor = CodeMirror.fromTextArea($("code"), {
    lineNumbers: true,
    mode: LANGUAGES[activeLanguage].mode,
    theme: "material-darker",
    indentUnit: 4,
    tabSize: 4,
    lineWrapping: false,
    extraKeys: {
      "Ctrl-Enter": runCode,
      "Cmd-Enter": runCode,
      Tab: (cm) => cm.replaceSelection("    ")
    }
  });

  const draftKey = (language) => `codelab-${language}-draft`;

  function saveDraft() {
    try { localStorage.setItem(draftKey(activeLanguage), editor.getValue()); } catch (error) {}
    $("lineCount").textContent = `${editor.lineCount()} lines`;
    const cursor = editor.getCursor();
    $("cursorPosition").textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
  }

  function setStatus(label, tone = "muted") {
    status.textContent = label;
    status.dataset.tone = tone;
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2400);
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decodeBase64(value) {
    if (!value) return "";
    try {
      const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch (error) { return value; }
  }

  function setOutput(text, tone = "normal") {
    output.textContent = text;
    output.dataset.tone = tone;
    output.scrollTop = output.scrollHeight;
  }

  function clearTerminal() {
    setOutput("Terminal cleared.\\n\\n› Ready for execution.");
    setStatus("IDLE");
  }

  function loadLanguage(language) {
    saveDraft();
    activeLanguage = language;
    const config = LANGUAGES[language];
    let draft = null;
    try { draft = localStorage.getItem(draftKey(language)); } catch (error) {}
    editor.setValue(draft !== null ? draft : config.starter);
    editor.setOption("mode", config.mode);
    $("fileTag").textContent = config.label;
    $("fileName").textContent = config.file;
    clearTerminal();
    saveDraft();
    editor.refresh();
  }

  function formatOutput(result, elapsedMs) {
    const stdout = decodeBase64(result.stdout);
    const stderr = decodeBase64(result.stderr);
    const compileOutput = decodeBase64(result.compile_output);
    const sections = [];
    if (stdout) sections.push(stdout.replace(/\\n$/, ""));
    if (stderr) sections.push("[stderr]\\n" + stderr.replace(/\\n$/, ""));
    if (compileOutput) sections.push("[compile output]\\n" + compileOutput.replace(/\\n$/, ""));
    if (!sections.length) sections.push(result.message || result.status?.description || "Program finished with no output.");
    const success = result.status?.id === 3;
    return {
      text: sections.join("\\n\\n") + "\\n\\n› " + (result.status?.description || "Finished") + "\\n› Completed in " + elapsedMs + " ms",
      success
    };
  }

  async function runCode() {
    if (isRunning) return;
    const sourceCode = editor.getValue();
    if (!sourceCode.trim()) { showToast("Write some code before running it."); return; }

    isRunning = true;
    runButton.disabled = true;
    runButton.textContent = "Running…";
    setStatus("RUNNING", "active");
    setOutput("› Sending code to Judge0…\\n› Compiling and running…");
    const startedAt = performance.now();

    try {
      const response = await fetch(JUDGE0_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          language_id: LANGUAGES[activeLanguage].id,
          source_code: encodeBase64(sourceCode),
          stdin: encodeBase64(stdin.value)
        })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error("Judge0 returned HTTP " + response.status + (detail ? ": " + detail.slice(0, 180) : ""));
      }
      const result = await response.json();
      const formatted = formatOutput(result, Math.round(performance.now() - startedAt));
      setOutput(formatted.text, formatted.success ? "success" : "error");
      setStatus(formatted.success ? "FINISHED" : "EXITED", formatted.success ? "success" : "error");
    } catch (error) {
      setOutput("› Execution failed\\n\\n" + (error.message || "Unknown error") + "\\n\\nCheck your internet connection or try again later.", "error");
      setStatus("ERROR", "error");
    } finally {
      isRunning = false;
      runButton.disabled = false;
      runButton.textContent = "▶ Run";
    }
  }

  languageSelect.addEventListener("change", () => loadLanguage(languageSelect.value));
  editor.on("change", saveDraft);
  editor.on("cursorActivity", saveDraft);
  $("reset").addEventListener("click", () => {
    editor.setValue(LANGUAGES[activeLanguage].starter);
    showToast("Starter code restored.");
  });
  runButton.addEventListener("click", runCode);
  $("clearInput").addEventListener("click", () => { stdin.value = ""; stdin.focus(); });
  $("clearOutput").addEventListener("click", clearTerminal);

  try {
    const draft = localStorage.getItem(draftKey(activeLanguage));
    if (draft !== null) editor.setValue(draft);
  } catch (error) {}
  saveDraft();
  setStatus("IDLE");
  window.addEventListener("resize", () => editor.refresh());
})();