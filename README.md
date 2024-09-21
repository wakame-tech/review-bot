# review-bot

Please set following repository secrets.

- `OPENAI_API_KEY`
- `REVIEW_PROMPT`

## example workflow

```yaml
name: review
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v2
      - uses: wakame-tech/review-bot@main
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          pr: ${{github.event.number}}
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          openai_model: gpt-4o-mini
          review_prompt: ${{ secrets.REVIEW_PROMPT }}
```
