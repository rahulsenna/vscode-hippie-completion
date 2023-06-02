// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface Dic {
    [key: string]: RegExpMatchArray | null
}

let word_list_global: Dic = {};
let word_list_current: string[] = [];
let matching: string[] = [];
let last_choice: string = '';
let orig_query: string = '';
let lookup_index: number = 0;

let case_separator = /([A-Z])?([^A-Z]*)/g;
let word_pattern = /(?<word>\w+)/gm;

async function modify_global_word_list(doc: vscode.TextDocument) {

	let words =  doc.getText().match(word_pattern);
	word_list_global[doc.fileName] = [...new Set(words)];		
}

async function modify_current_word_list(editor: vscode.TextEditor) {

	let cursor = editor.selection.active;
	let head_range = new vscode.Range(new vscode.Position(0, 0), cursor);
	let head_text = editor.document.getText(head_range);
	let head_words = head_text.match(word_pattern)?.reverse();
	word_list_current = [...new Set(head_words)];

	var last_line = new vscode.Position(editor.document.lineCount - 1, 100);
	let tail_range = new vscode.Range(cursor, last_line);
	let tail_text = editor.document.getText(tail_range);
	let tail_words = tail_text.match(word_pattern);
	if (tail_words) {
		word_list_current.push(...tail_words.reverse());
	}
}


function did_match(candidate_word: string, query: string) {

	if (candidate_word.includes(query)) {
		return(true);
	}

	return query.toLowerCase().split('').every(char => candidate_word.toLowerCase().includes(char));	
}

function compare(a: string, b: string, query: string): number {
	if (a === b) return 0;

	const a_lower = a.toLowerCase(), b_lower = b.toLowerCase(), query_lower = query.toLowerCase();
	let a_rank = 0, b_rank = 0;

	if (a_lower.includes(query_lower)) a_rank += query.length;
	if (b_lower.includes(query_lower)) b_rank += query.length;

	const query_chars = new Set(query_lower);  
	for (const char of query_chars)
	{
	  if (a_lower.includes(char)) a_rank++
	  if (b_lower.includes(char)) b_rank++
	}

	if (a === a.toUpperCase()) a = a_lower;
	if (b === b.toUpperCase()) b = b_lower;

	const a_words = a.split(/(?=[A-Z])|_/).map((word) => word.toLowerCase());
	const b_words = b.split(/(?=[A-Z])|_/).map((word) => word.toLowerCase());
  
	for (const [i, char] of query_lower.split('').entries()) {
	  if (a_words[i]?.[0] === char) a_rank += 2;
  
	  if (b_words[i]?.[0] === char) b_rank += 2;
	}
  
	return a_rank === b_rank ? 0 : a_rank > b_rank ? -1 : 1;
}

function hippee_ki_yay(editor: vscode.TextEditor, backward: boolean)
{
	const query_range = editor.document.getWordRangeAtPosition(editor.selection.active, /\w+/);
		if (!query_range) { return; }
		const query = editor.document.getText(query_range);

		if (query !== last_choice) 
		{
			orig_query = query;
			lookup_index = backward? -1:0; 
			matching = [];

			word_list_current.forEach(word => {
				if (word !== query && word[0].toLowerCase() === query[0].toLowerCase() && did_match(word, query)) 
				{
					matching.push(word);
				}
			});
			if (matching.length === 0) {
				for (const w_list of Object.values(word_list_global)) {
					if (!w_list) { continue; }

					w_list.forEach(word => {
						if (!matching.includes(word) && word !== query && word[0].toLowerCase() === query[0].toLowerCase() && did_match(word, query)) 
						{
							matching.push(word);
						}
					});
				}
			}
			if (matching.length === 0) { return; }

			matching.sort((a, b) => compare(a, b, query)); // sort by rank

		} else { lookup_index += backward? -1:+1; }

		if (lookup_index < 0) { lookup_index = matching.length+lookup_index; } // wrap around
		last_choice = matching[lookup_index]

		if (!last_choice)  // ran out of matches in current word list
		{ 
			lookup_index = 0;
			return;
			// TODO: get additional matches from global word list;
		}
		
	// replace query with choice
	editor.edit(edit => {// @ts-ignore
		editor.selections.forEach(selection => {// @ts-ignore
			const range = editor.document.getWordRangeAtPosition(selection.end);
			if (!range) { return; }
			edit.delete(range);
			edit.insert(range.end, last_choice);
		});
	});
}


export function activate(context: vscode.ExtensionContext) {


	let next = vscode.commands.registerCommand('hippie-completion.next', () => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		hippee_ki_yay(editor, false);
	});
	context.subscriptions.push(next);


	let prev = vscode.commands.registerCommand('hippie-completion.prev', () => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		hippee_ki_yay(editor, true);
	});
	context.subscriptions.push(prev);

	vscode.workspace.onDidChangeTextDocument((e) => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		modify_current_word_list(editor);
	});
	
	vscode.workspace.onDidOpenTextDocument((doc) => {
		modify_global_word_list(doc);
	});
	vscode.workspace.textDocuments.forEach((doc) => {
		modify_global_word_list(doc);
	});

}

// this method is called when your extension is deactivated
export function deactivate() { }
