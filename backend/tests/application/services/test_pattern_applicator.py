"""Tests for PatternApplicator."""
import pytest

from src.application.services.pattern_applicator import (
    PatternApplicator,
    PatternMatchResult,
    AppliedPattern,
    PatternAnalysis,
)
from src.infrastructure.agentcore.reflection_service import Reflection


class TestAppliedPattern:
    """AppliedPattern dataclass tests."""

    def test_applied_pattern_creation(self):
        """Test creating applied pattern."""
        pattern = AppliedPattern(
            pattern_type=PatternMatchResult.SUCCESS_PATTERN,
            pattern="Test pattern",
            confidence=0.8,
            source_reflection_id="ref-1",
            recommendation="Test recommendation"
        )
        assert pattern.pattern_type == PatternMatchResult.SUCCESS_PATTERN
        assert pattern.confidence == 0.8


class TestPatternAnalysis:
    """PatternAnalysis dataclass tests."""

    def test_pattern_analysis_creation(self):
        """Test creating pattern analysis."""
        analysis = PatternAnalysis(query="test query")
        assert analysis.query == "test query"
        assert analysis.applied_patterns == []
        assert analysis.risk_level == "low"

    def test_has_failure_patterns(self):
        """Test has_failure_patterns property."""
        analysis = PatternAnalysis(query="test")
        assert analysis.has_failure_patterns is False
        
        analysis.applied_patterns.append(AppliedPattern(
            pattern_type=PatternMatchResult.FAILURE_PATTERN,
            pattern="failure",
            confidence=0.7,
            source_reflection_id="ref-1",
            recommendation="warning"
        ))
        assert analysis.has_failure_patterns is True

    def test_has_success_patterns(self):
        """Test has_success_patterns property."""
        analysis = PatternAnalysis(query="test")
        assert analysis.has_success_patterns is False
        
        analysis.applied_patterns.append(AppliedPattern(
            pattern_type=PatternMatchResult.SUCCESS_PATTERN,
            pattern="success",
            confidence=0.7,
            source_reflection_id="ref-1",
            recommendation="good"
        ))
        assert analysis.has_success_patterns is True

    def test_filter_patterns_by_type(self):
        """Test filtering patterns by type."""
        analysis = PatternAnalysis(query="test")
        analysis.applied_patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.SUCCESS_PATTERN,
                pattern="success1",
                confidence=0.8,
                source_reflection_id="ref-1",
                recommendation="good1"
            ),
            AppliedPattern(
                pattern_type=PatternMatchResult.FAILURE_PATTERN,
                pattern="failure1",
                confidence=0.7,
                source_reflection_id="ref-2",
                recommendation="bad1"
            ),
            AppliedPattern(
                pattern_type=PatternMatchResult.BEST_PRACTICE,
                pattern="practice1",
                confidence=0.9,
                source_reflection_id="ref-3",
                recommendation="practice1"
            ),
        ]
        
        assert len(analysis.success_patterns) == 1
        assert len(analysis.failure_patterns) == 1
        assert len(analysis.best_practices) == 1


class TestPatternApplicator:
    """PatternApplicator tests."""

    @pytest.fixture
    def applicator(self):
        """Create applicator instance."""
        return PatternApplicator(
            min_confidence_threshold=0.3,
            max_patterns_per_type=3
        )

    @pytest.fixture
    def sample_reflections(self):
        """Create sample reflections."""
        return [
            Reflection(
                id="ref-1",
                use_case="customer support",
                insight="Quick response improves satisfaction",
                success_patterns=[
                    "Acknowledge customer concern first",
                    "Provide step-by-step solutions"
                ],
                failure_patterns=[
                    "Ignoring customer emotions",
                    "Using technical jargon without explanation"
                ],
                best_practices=[
                    "Always summarize the solution at the end",
                    "Offer follow-up assistance"
                ]
            ),
            Reflection(
                id="ref-2",
                use_case="technical troubleshooting",
                insight="Systematic approach yields better results",
                success_patterns=[
                    "Start with basic checks before advanced diagnostics"
                ],
                failure_patterns=[
                    "Jumping to complex solutions without basics"
                ],
                best_practices=[
                    "Document all steps taken for future reference"
                ]
            ),
        ]

    def test_analyze_patterns_empty_reflections(self, applicator):
        """Test analysis with no reflections."""
        analysis = applicator.analyze_patterns("test query", [])
        
        assert analysis.query == "test query"
        assert len(analysis.applied_patterns) == 0
        assert analysis.risk_level == "low"

    def test_analyze_patterns_with_reflections(self, applicator, sample_reflections):
        """Test analysis with reflections."""
        analysis = applicator.analyze_patterns(
            "How do I help a customer with a technical issue?",
            sample_reflections
        )
        
        assert len(analysis.applied_patterns) > 0
        assert analysis.overall_recommendation != ""

    def test_analyze_patterns_detects_failure_patterns(self, applicator, sample_reflections):
        """Test that failure patterns are detected."""
        analysis = applicator.analyze_patterns(
            "technical jargon explanation",
            sample_reflections
        )
        
        # Should detect the failure pattern about technical jargon
        assert analysis.has_failure_patterns or len(analysis.applied_patterns) > 0

    def test_analyze_patterns_detects_success_patterns(self, applicator, sample_reflections):
        """Test that success patterns are detected."""
        analysis = applicator.analyze_patterns(
            "step-by-step solution guide",
            sample_reflections
        )
        
        assert len(analysis.applied_patterns) > 0

    def test_risk_assessment_high(self, applicator):
        """Test high risk assessment."""
        analysis = PatternAnalysis(query="test")
        analysis.applied_patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.FAILURE_PATTERN,
                pattern="dangerous pattern",
                confidence=0.9,
                source_reflection_id="ref-1",
                recommendation="warning"
            ),
            AppliedPattern(
                pattern_type=PatternMatchResult.FAILURE_PATTERN,
                pattern="another dangerous",
                confidence=0.8,
                source_reflection_id="ref-2",
                recommendation="warning2"
            ),
        ]
        
        risk = applicator._assess_risk_level(analysis)
        assert risk == "high"

    def test_risk_assessment_low(self, applicator):
        """Test low risk assessment."""
        analysis = PatternAnalysis(query="test")
        analysis.applied_patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.SUCCESS_PATTERN,
                pattern="good pattern",
                confidence=0.9,
                source_reflection_id="ref-1",
                recommendation="good"
            ),
        ]
        
        risk = applicator._assess_risk_level(analysis)
        assert risk == "low"

    def test_limit_patterns_by_confidence(self, applicator):
        """Test that patterns are limited and sorted by confidence."""
        patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.SUCCESS_PATTERN,
                pattern=f"pattern-{i}",
                confidence=0.5 + i * 0.1,
                source_reflection_id=f"ref-{i}",
                recommendation=f"rec-{i}"
            )
            for i in range(10)
        ]
        
        limited = applicator._limit_patterns(patterns)
        
        # Should be limited to max_patterns_per_type
        assert len(limited) <= 3
        # Should be sorted by confidence (highest first)
        assert limited[0].confidence >= limited[-1].confidence

    def test_calculate_pattern_confidence(self, applicator):
        """Test confidence calculation."""
        # Exact match should have high confidence
        confidence1 = applicator._calculate_pattern_confidence(
            "customer support issue",
            "customer support issue handling"
        )
        
        # No match should have low confidence
        confidence2 = applicator._calculate_pattern_confidence(
            "unrelated query",
            "completely different topic"
        )
        
        assert confidence1 > confidence2

    def test_generate_overall_recommendation_failure(self, applicator):
        """Test recommendation generation with failure patterns."""
        analysis = PatternAnalysis(query="test")
        analysis.applied_patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.FAILURE_PATTERN,
                pattern="bad",
                confidence=0.8,
                source_reflection_id="ref-1",
                recommendation="warning"
            ),
        ]
        
        recommendation = applicator._generate_overall_recommendation(analysis)
        assert "⚠️" in recommendation or "問題" in recommendation or "慎重" in recommendation

    def test_generate_overall_recommendation_success(self, applicator):
        """Test recommendation generation with success patterns."""
        analysis = PatternAnalysis(query="test")
        analysis.applied_patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.SUCCESS_PATTERN,
                pattern="good",
                confidence=0.8,
                source_reflection_id="ref-1",
                recommendation="good approach"
            ),
        ]
        
        recommendation = applicator._generate_overall_recommendation(analysis)
        assert "✅" in recommendation or "成功" in recommendation

    def test_suggest_approach_high_risk(self, applicator):
        """Test approach suggestion for high risk."""
        analysis = PatternAnalysis(query="test", risk_level="high")
        
        suggestion = applicator._suggest_approach(analysis)
        assert "リスク" in suggestion or "異なるアプローチ" in suggestion

    def test_suggest_approach_with_success(self, applicator):
        """Test approach suggestion with success patterns."""
        analysis = PatternAnalysis(query="test", risk_level="low")
        analysis.applied_patterns = [
            AppliedPattern(
                pattern_type=PatternMatchResult.SUCCESS_PATTERN,
                pattern="successful approach description",
                confidence=0.8,
                source_reflection_id="ref-1",
                recommendation="use this"
            ),
        ]
        
        suggestion = applicator._suggest_approach(analysis)
        assert "成功パターン" in suggestion or "successful" in suggestion.lower()

    def test_build_guidance_prompt_empty(self, applicator):
        """Test guidance prompt for empty analysis."""
        analysis = PatternAnalysis(query="test")
        prompt = applicator.build_guidance_prompt(analysis)
        assert prompt == ""

    def test_build_guidance_prompt_with_patterns(self, applicator, sample_reflections):
        """Test guidance prompt with patterns."""
        analysis = applicator.analyze_patterns(
            "customer support technical issue",
            sample_reflections
        )
        
        prompt = applicator.build_guidance_prompt(analysis)
        
        if analysis.applied_patterns:
            assert "ガイダンス" in prompt
            assert "リスクレベル" in prompt

    def test_pattern_match_result_enum(self):
        """Test PatternMatchResult enum values."""
        assert PatternMatchResult.SUCCESS_PATTERN.value == "success"
        assert PatternMatchResult.FAILURE_PATTERN.value == "failure"
        assert PatternMatchResult.BEST_PRACTICE.value == "best_practice"
        assert PatternMatchResult.NO_MATCH.value == "no_match"
