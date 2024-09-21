# review-bot

## inputs

```yaml
- name: Review
  uses: wakame-tech/review-bot
  with:
    pr: ${{github.event.number}}
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    openai_model: gpt-4o-mini
    review_prompt: ${{ secrets.REVIEW_PROMPT }}
```
