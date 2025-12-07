"""
Pattern Applicator - Apply success/failure patterns to agent decision making.

Reflectionsから抽出された成功/失敗パターンをエージェントの判断に適用する。
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import structlog

from src.infrastructure.agentcore.reflection_service import Reflection

logger = structlog.get_logger(__name__)


class PatternMatchResult(Enum):
    """パターンマッチ結果"""
    SUCCESS_PATTERN = "success"
    FAILURE_PATTERN = "failure"
    BEST_PRACTICE = "best_practice"
    NO_MATCH = "no_match"


@dataclass
class AppliedPattern:
    """適用されたパターン"""
    pattern_type: PatternMatchResult
    pattern: str
    confidence: float  # 0.0 - 1.0
    source_reflection_id: str
    recommendation: str


@dataclass
class PatternAnalysis:
    """パターン分析結果"""
    query: str
    applied_patterns: list[AppliedPattern] = field(default_factory=list)
    overall_recommendation: str = ""
    risk_level: str = "low"  # low, medium, high
    suggested_approach: str = ""

    @property
    def has_failure_patterns(self) -> bool:
        return any(
            p.pattern_type == PatternMatchResult.FAILURE_PATTERN 
            for p in self.applied_patterns
        )

    @property
    def has_success_patterns(self) -> bool:
        return any(
            p.pattern_type == PatternMatchResult.SUCCESS_PATTERN 
            for p in self.applied_patterns
        )

    @property
    def success_patterns(self) -> list[AppliedPattern]:
        return [
            p for p in self.applied_patterns 
            if p.pattern_type == PatternMatchResult.SUCCESS_PATTERN
        ]

    @property
    def failure_patterns(self) -> list[AppliedPattern]:
        return [
            p for p in self.applied_patterns 
            if p.pattern_type == PatternMatchResult.FAILURE_PATTERN
        ]

    @property
    def best_practices(self) -> list[AppliedPattern]:
        return [
            p for p in self.applied_patterns 
            if p.pattern_type == PatternMatchResult.BEST_PRACTICE
        ]


class PatternApplicator:
    """
    パターン適用サービス
    
    Reflectionsから抽出されたパターンを現在のクエリに適用し、
    エージェントの判断をガイドする。
    """

    def __init__(
        self,
        min_confidence_threshold: float = 0.5,
        max_patterns_per_type: int = 3
    ):
        self._min_confidence = min_confidence_threshold
        self._max_patterns = max_patterns_per_type

    def analyze_patterns(
        self,
        query: str,
        reflections: list[Reflection]
    ) -> PatternAnalysis:
        """
        クエリに対してパターン分析を実行
        
        Args:
            query: ユーザーのクエリ
            reflections: 関連するReflections
        
        Returns:
            PatternAnalysis: 分析結果
        """
        analysis = PatternAnalysis(query=query)
        
        if not reflections:
            return analysis
        
        # 各Reflectionからパターンを抽出して適用
        for reflection in reflections:
            self._apply_reflection_patterns(query, reflection, analysis)
        
        # パターン数を制限
        analysis.applied_patterns = self._limit_patterns(analysis.applied_patterns)
        
        # 全体的な推奨事項を生成
        analysis.overall_recommendation = self._generate_overall_recommendation(analysis)
        analysis.risk_level = self._assess_risk_level(analysis)
        analysis.suggested_approach = self._suggest_approach(analysis)
        
        logger.info(
            "pattern_analysis_complete",
            query_length=len(query),
            pattern_count=len(analysis.applied_patterns),
            risk_level=analysis.risk_level
        )
        
        return analysis

    def _apply_reflection_patterns(
        self,
        query: str,
        reflection: Reflection,
        analysis: PatternAnalysis
    ) -> None:
        """Reflectionからパターンを抽出して適用"""
        query_lower = query.lower()
        
        # 成功パターンをチェック
        for pattern in reflection.success_patterns:
            confidence = self._calculate_pattern_confidence(query_lower, pattern)
            if confidence >= self._min_confidence:
                analysis.applied_patterns.append(AppliedPattern(
                    pattern_type=PatternMatchResult.SUCCESS_PATTERN,
                    pattern=pattern,
                    confidence=confidence,
                    source_reflection_id=reflection.id,
                    recommendation=f"このアプローチを検討: {pattern[:100]}"
                ))
        
        # 失敗パターンをチェック
        for pattern in reflection.failure_patterns:
            confidence = self._calculate_pattern_confidence(query_lower, pattern)
            if confidence >= self._min_confidence:
                analysis.applied_patterns.append(AppliedPattern(
                    pattern_type=PatternMatchResult.FAILURE_PATTERN,
                    pattern=pattern,
                    confidence=confidence,
                    source_reflection_id=reflection.id,
                    recommendation=f"注意: 過去に問題があったパターン - {pattern[:100]}"
                ))
        
        # ベストプラクティスをチェック
        for practice in reflection.best_practices:
            confidence = self._calculate_pattern_confidence(query_lower, practice)
            if confidence >= self._min_confidence:
                analysis.applied_patterns.append(AppliedPattern(
                    pattern_type=PatternMatchResult.BEST_PRACTICE,
                    pattern=practice,
                    confidence=confidence,
                    source_reflection_id=reflection.id,
                    recommendation=f"ベストプラクティス: {practice[:100]}"
                ))

    def _calculate_pattern_confidence(self, query: str, pattern: str) -> float:
        """
        パターンの適用信頼度を計算
        
        簡易的なキーワードマッチングベースの信頼度計算。
        本番環境では埋め込みベースの類似度計算を推奨。
        """
        pattern_lower = pattern.lower()
        
        # キーワード重複度を計算
        query_words = set(query.split())
        pattern_words = set(pattern_lower.split())
        
        if not pattern_words:
            return 0.0
        
        common_words = query_words & pattern_words
        # ストップワードを除外
        stop_words = {"の", "は", "が", "を", "に", "と", "で", "a", "the", "is", "are", "to", "for"}
        common_words -= stop_words
        
        if not common_words:
            return 0.3  # 基本的な関連性は認める
        
        # Jaccard係数ベースの信頼度
        union_words = query_words | pattern_words - stop_words
        if not union_words:
            return 0.3
        
        jaccard = len(common_words) / len(union_words)
        
        # 0.3 - 1.0 の範囲にスケーリング
        return min(0.3 + jaccard * 0.7, 1.0)

    def _limit_patterns(self, patterns: list[AppliedPattern]) -> list[AppliedPattern]:
        """パターン数を制限（信頼度でソート）"""
        # 信頼度で降順ソート
        sorted_patterns = sorted(patterns, key=lambda p: p.confidence, reverse=True)
        
        # タイプごとに制限
        result = []
        type_counts: dict[PatternMatchResult, int] = {}
        
        for pattern in sorted_patterns:
            current_count = type_counts.get(pattern.pattern_type, 0)
            if current_count < self._max_patterns:
                result.append(pattern)
                type_counts[pattern.pattern_type] = current_count + 1
        
        return result

    def _generate_overall_recommendation(self, analysis: PatternAnalysis) -> str:
        """全体的な推奨事項を生成"""
        recommendations = []
        
        if analysis.has_failure_patterns:
            recommendations.append(
                "⚠️ 過去に問題が発生したパターンと類似しています。慎重に進めてください。"
            )
        
        if analysis.has_success_patterns:
            recommendations.append(
                "✅ 過去に成功したアプローチが適用可能です。"
            )
        
        if analysis.best_practices:
            recommendations.append(
                "📋 関連するベストプラクティスを参考にしてください。"
            )
        
        if not recommendations:
            return "特に注意すべきパターンは検出されませんでした。"
        
        return " ".join(recommendations)

    def _assess_risk_level(self, analysis: PatternAnalysis) -> str:
        """リスクレベルを評価"""
        failure_count = len(analysis.failure_patterns)
        success_count = len(analysis.success_patterns)
        
        # 失敗パターンの信頼度平均
        if failure_count > 0:
            avg_failure_confidence = sum(
                p.confidence for p in analysis.failure_patterns
            ) / failure_count
            
            if avg_failure_confidence > 0.7 or failure_count >= 2:
                return "high"
            elif avg_failure_confidence > 0.5:
                return "medium"
        
        # 成功パターンがあればリスク低減
        if success_count > failure_count:
            return "low"
        
        return "medium" if failure_count > 0 else "low"

    def _suggest_approach(self, analysis: PatternAnalysis) -> str:
        """推奨アプローチを提案"""
        if analysis.risk_level == "high":
            return (
                "リスクが高いです。過去の失敗パターンを確認し、"
                "異なるアプローチを検討することを推奨します。"
            )
        
        if analysis.has_success_patterns:
            top_success = analysis.success_patterns[0]
            return f"成功パターンを参考に: {top_success.pattern[:150]}"
        
        if analysis.best_practices:
            top_practice = analysis.best_practices[0]
            return f"ベストプラクティスを適用: {top_practice.pattern[:150]}"
        
        return "標準的なアプローチで進めてください。"

    def build_guidance_prompt(self, analysis: PatternAnalysis) -> str:
        """
        エージェント向けのガイダンスプロンプトを生成
        """
        if not analysis.applied_patterns:
            return ""
        
        lines = ["## 過去の学習からのガイダンス:"]
        lines.append(f"\n{analysis.overall_recommendation}")
        lines.append(f"\nリスクレベル: {analysis.risk_level.upper()}")
        
        if analysis.failure_patterns:
            lines.append("\n### ⚠️ 注意すべきパターン:")
            for p in analysis.failure_patterns[:2]:
                lines.append(f"- {p.recommendation}")
        
        if analysis.success_patterns:
            lines.append("\n### ✅ 成功パターン:")
            for p in analysis.success_patterns[:2]:
                lines.append(f"- {p.recommendation}")
        
        if analysis.best_practices:
            lines.append("\n### 📋 ベストプラクティス:")
            for p in analysis.best_practices[:2]:
                lines.append(f"- {p.recommendation}")
        
        lines.append(f"\n推奨アプローチ: {analysis.suggested_approach}")
        
        return "\n".join(lines)
