#!/usr/bin/env -S ${HOME}/.deno/bin/deno run -A
import { Octokit } from "https://esm.sh/octokit@3.1.0";
import $ from "https://deno.land/x/dax@0.39.2/mod.ts";
import { Diff, parse } from "https://deno.land/x/diff_parser@v0.2.0/mod.ts";
import { FunctionObject, Message, ReviewComment } from "./types.ts";
import { debug, getInput } from "npm:@actions/core@1.10.1";

const fetchPrDiffs = async (
    ownerRepo: string,
    pr: string,
): Promise<Diff[]> => {
    const res_pr_diff = await $`gh pr diff ${pr} --repo ${ownerRepo}`
        .text();
    return parse(res_pr_diff);
};

const validateReviewComments = (
    diffs: Diff[],
    comments: ReviewComment[],
): ReviewComment[] => {
    const diffPathAndLineRanges: Record<string, [number, number][]> = {};
    for (const diff of diffs) {
        const fileName = diff.afterFileName.slice(2);
        if (!diffPathAndLineRanges[fileName]) {
            diffPathAndLineRanges[fileName] = [];
        }
        for (const hunk of diff.hunks) {
            diffPathAndLineRanges[fileName].push([
                hunk.header.afterStartLine,
                hunk.header.afterStartLine + hunk.header.afterLines - 1,
            ]);
        }
    }

    return comments.filter((comment) => {
        const ranges = diffPathAndLineRanges[comment.path];
        if (!ranges) {
            return false;
        }
        for (const [start, end] of ranges) {
            if (start <= comment.line && comment.line <= end) {
                return true;
            }
        }
        return false;
    });
};

const diffAsText = (patch: Diff): string => {
    let res = "";
    const fileName = patch.afterFileName.slice(2);
    res += `path: ${fileName}\n`;
    for (const hunk of patch.hunks) {
        let n = hunk.header.afterStartLine;
        for (const line of hunk.lines) {
            if (line.mark === "add") {
                res += `line${n}:${line.text}\n`;
            }
            n += 1;
        }
    }
    return res;
};

const submitComments = async (
    octokit: Octokit,
    ownerRepo: string,
    pr: string,
    commit: string,
    comments: ReviewComment[],
) => {
    const [owner, repo] = ownerRepo.split("/");
    // docs: https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#create-a-review-for-a-pull-request
    if (comments.length === 0) {
        const res = await octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number: parseInt(pr),
            commit_id: commit,
            body: "LGTM",
            event: "COMMENT",
        });
        console.log(res);
    } else {
        const res = await octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number: parseInt(pr),
            commit_id: commit,
            event: "COMMENT",
            comments,
        });
        console.log(res);
    }
};

const fetchPrLastCommit = async (
    ownerRepo: string,
    pr: string,
): Promise<string> => {
    const res_pr_commits =
        await $`gh pr view ${pr} --json commits --jq .commits[].oid --repo ${ownerRepo}`
            .text();
    const commits = res_pr_commits.split("\n");
    return commits[commits.length - 1];
};

export const reviewDiffByAI = async (
    apiKey: string,
    model: string,
    diffText: string,
    reviewPrompt: string,
): Promise<ReviewComment[]> => {
    const res = await chatCompletionRequest(apiKey, model, [
        {
            role: "system",
            content: reviewPrompt,
        },
        {
            role: "user",
            content: diffText,
        },
    ], [
        {
            name: "review",
            description: "レビューコメントを作成します",
            parameters: {
                type: "object",
                properties: {
                    comments: {
                        type: "array",
                        items: {
                            type: "object",
                            description: "レビューコメント",
                            properties: {
                                path: {
                                    type: "string",
                                    description: "ファイルパス",
                                },
                                line: {
                                    type: "number",
                                    description: "行番号",
                                },
                                body: {
                                    type: "string",
                                    description: "コメント内容",
                                },
                            },
                            required: ["path", "line", "body"],
                        },
                    },
                },
                required: ["comments"],
            },
        },
    ]);
    console.log(`tokens: ${res.usage.total_tokens}`);
    const args = JSON.parse(res.choices[0].message.function_call.arguments);
    return args.comments;
};

const chatCompletionRequest = (
    api_key: string,
    model: string,
    messages: Message[],
    functions: FunctionObject[],
    function_call: "auto" | { name: string } = "auto",
) => {
    return fetch(
        "https://api.openai.com/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${api_key}`,
            },
            body: JSON.stringify({
                model,
                messages,
                functions,
                function_call,
            }),
        },
    )
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(
                    `${res.status}\n${await res.text()}`,
                );
            }
            return res.json();
        });
};

const main = async () => {
    const auth = Deno.env.get("GH_TOKEN")!;
    const octokit = new Octokit({ auth });
    const openaiApiKey = getInput("openai_api_key", { required: true });
    const model = getInput("openai_model", { required: true });
    const ownerRepo = getInput("repo", { required: true });
    const pr = getInput("pr", { required: true });
    debug(`pr: ${pr}`);
    const prompt = getInput("review_prompt");
    const commit = await fetchPrLastCommit(ownerRepo, pr);
    debug(`commit: ${commit}`);

    const diffs = await fetchPrDiffs(ownerRepo, pr);
    const reviewComments: ReviewComment[] = [];
    const linesLimit = 100;
    let diffText = "";
    for (const diff of diffs) {
        diffText += diffAsText(diff) + "\n\n";
        if (diffText.split("\n").length > linesLimit) {
            const comments = await reviewDiffByAI(
                openaiApiKey,
                model,
                diffText,
                prompt,
            );
            reviewComments.push(...comments);
            diffText = "";
        }
    }

    // validation
    const validated = validateReviewComments(diffs, reviewComments);
    console.log(validated);
    await submitComments(octokit, ownerRepo, pr, commit, validated);
};

main();

Deno.exit(0);
