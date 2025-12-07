"""System prompts for the Strands Agent.

Contains the default system prompt and utilities for building
context-aware prompts with episodic memory and reflections.
"""

from typing import Any

SYSTEM_PROMPT = """あなたは優秀なカスタマーサポートアシスタントです。

## 利用可能なツール

### ナレッジベース検索
- search_knowledge_base: 製品情報、FAQ、マニュアルなどを検索

## 回答のガイドライン

1. **情報収集優先**: 必要な情報をツールで取得してから回答する
2. **正確性**: 推測で回答せず、確認できた情報のみを伝える
3. **丁寧な日本語**: 分かりやすく丁寧な日本語で回答する
4. **確認姿勢**: 不明点があれば積極的に確認する
5. **個人情報保護**: 個人情報の取り扱いに注意する

## 回答フォーマット

- 箇条書きや番号付きリストを活用して読みやすく
- 長い回答は適切にセクション分けする
- 重要な情報は強調する
"""

SYSTEM_PROMPT_WITH_CONTEXT_TEMPLATE = """{base_prompt}

{episodic_context}

{reflection_context}

## 現在のセッション情報
- セッションID: {session_id}
- ユーザーID: {user_id}
- テナントID: {tenant_id}
"""


def build_system_prompt(
    session_id: str = "",
    user_id: str = "",
    tenant_id: str = "",
    episodic_context: str = "",
    reflection_context: str = "",
    base_prompt: str | None = None,
) -> str:
    """Build a context-aware system prompt.
    
    Combines the base system prompt with episodic memory context
    and reflection insights for more informed responses.
    
    Args:
        session_id: Current session identifier
        user_id: Current user identifier
        tenant_id: Current tenant identifier
        episodic_context: Context built from similar past episodes
        reflection_context: Context built from reflections/insights
        base_prompt: Optional custom base prompt (uses default if None)
    
    Returns:
        Complete system prompt with context
    """
    prompt = base_prompt or SYSTEM_PROMPT
    
    # If no context, return base prompt
    if not episodic_context and not reflection_context:
        return prompt
    
    return SYSTEM_PROMPT_WITH_CONTEXT_TEMPLATE.format(
        base_prompt=prompt,
        episodic_context=episodic_context or "",
        reflection_context=reflection_context or "",
        session_id=session_id or "N/A",
        user_id=user_id or "N/A",
        tenant_id=tenant_id or "N/A",
    )


def build_rag_context(search_results: list[dict[str, Any]]) -> str:
    """Build context string from RAG search results.
    
    Args:
        search_results: List of search result dictionaries with
                       'content' and 'source' keys
    
    Returns:
        Formatted context string for the agent
    """
    if not search_results:
        return ""
    
    parts = ["## 関連するナレッジベース情報:"]
    
    for i, result in enumerate(search_results, 1):
        content = result.get("content", "")
        source = result.get("source", "Unknown")
        score = result.get("score", 0.0)
        
        parts.append(f"\n### 情報源 {i}: {source} (関連度: {score:.2f})")
        parts.append(content)
    
    return "\n".join(parts)
