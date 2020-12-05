/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from "vscode";
import { readFileSync } from "fs";
import { join } from "path";

let colorMapper: { [colorStr: string]: Set<string> } = {};
let additionActionSearchRegex: string | undefined;
let additionActionReplaceTargets: string[] | undefined;

function getColorMapper(path: string) {
  const text = readFileSync(path, { encoding: "utf8" });
  const matches = text.match(/\$[\w-]+:\s*#([0-9a-f]{3})+\b/gi);
  const colorMapper: { [colorStr: string]: Set<string> } = {};
  if (matches) {
    for (let match of matches) {
      let [colorVar, colorStr] = match.split(/\s*:\s*/);
      colorStr = colorStr.toLowerCase();
      if (!colorMapper[colorStr]) {
        colorMapper[colorStr] = new Set();
      }
      colorMapper[colorStr].add(colorVar);
    }
  }
  return colorMapper;
}

export function activate(context: vscode.ExtensionContext) {
  const workbenchConfig = vscode.workspace.getConfiguration("cssAction");
  const colorVariablesFilePath = workbenchConfig.get<string>(
    "colorVariablesFile"
  );
  additionActionSearchRegex = workbenchConfig.get<string>(
    "additionActionSearchRegex"
  );
  additionActionReplaceTargets = workbenchConfig.get<string[]>(
    "additionActionReplaceTargets"
  );

  if (colorVariablesFilePath) {
    const fullPath = join(
      vscode.workspace.rootPath || "",
      colorVariablesFilePath
    );
    colorMapper = getColorMapper(fullPath);

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        [{ language: "scss" }, { language: "less" }, { language: "vue" }],
        new ColorVarReplacer(),
        {
          providedCodeActionKinds: ColorVarReplacer.providedCodeActionKinds,
        }
      )
    );
  }

  if (additionActionSearchRegex && additionActionReplaceTargets) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        [{ language: "scss" }, { language: "less" }, { language: "vue" }],
        new RegexReplacer(),
        {
          providedCodeActionKinds: RegexReplacer.providedCodeActionKinds,
        }
      )
    );
  }
}

export class RegexReplacer implements vscode.CodeActionProvider {
  public regex = new RegExp(additionActionSearchRegex!, "i");

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] | undefined {
    const [matchResult, line] = this.isMatchRegex(document, range);
    if (!matchResult) {
      return;
    }
    const lineRange = line.range;
    const originText = matchResult[0];

    const originRange = new vscode.Range(
      lineRange.start.translate(0, matchResult.index),
      lineRange.start.translate(0, matchResult.index + originText.length)
    );

    const targetTexts = this.getReplaceTargets(originText);

    const fixes = targetTexts.map((targetText) =>
      this.createFix(document, originRange, targetText, originText)
    );

    if (fixes.length) {
      fixes[0].isPreferred = true;
    }

    return fixes;
  }

  public getReplaceTargets(originText: string): string[] {
    return additionActionReplaceTargets!.map((target) =>
      originText.replace(this.regex, target)
    );
  }

  private isMatchRegex(
    document: vscode.TextDocument,
    range: vscode.Range
  ): [RegExpExecArray | null, vscode.TextLine] {
    const start = range.start;
    const line = document.lineAt(start.line);
    const matchResult = this.regex.exec(line.text);
    return [matchResult, line];
  }

  private createFix(
    document: vscode.TextDocument,
    range: vscode.Range,
    targetText: string,
    originText: string
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Replace [ ${originText} ] with ${targetText}`,
      vscode.CodeActionKind.QuickFix
    );
    fix.edit = new vscode.WorkspaceEdit();
    fix.edit.replace(document.uri, range, targetText);
    return fix;
  }
}

/**
 * Provides code actions for converting hex color string to a color var.
 */
export class ColorVarReplacer extends RegexReplacer {
  public regex = /#([0-9a-f]{3})+\b/i;

  public getReplaceTargets(originText: string): string[] {
    return Array.from(colorMapper[originText.toLowerCase()]);
  }
}
