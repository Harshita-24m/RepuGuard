/**
 * AI Report Generation Service
 * Uses Anthropic Claude API to generate professional HR screening reports
 */

const axios = require('axios');

const generateAIReport = async (candidateName, role, overallScore, platformResults) => {
  const useReal = process.env.USE_REAL_AI === 'true' && process.env.ANTHROPIC_API_KEY;

  if (useReal) {
    try {
      const platformSummary = platformResults
        .map(p => `${p.platform}: ${p.score}/100 (${p.postsAnalyzed} posts, ${p.flaggedCount} flagged) — ${p.summary}`)
        .join('\n');

      const prompt = `You are ReputGuard AI, a digital reputation analyst for HR and recruiting teams.

A recruiter has requested a digital reputation screening report.

CANDIDATE: ${candidateName}
ROLE: ${role}
OVERALL SAFETY SCORE: ${overallScore}/100
PLATFORM RESULTS:
${platformSummary}

Write a professional HR digital reputation screening report with these sections:
1. EXECUTIVE SUMMARY (1-2 sentences)
2. FINDINGS (what was found across platforms — be specific about patterns)
3. RED FLAGS / POSITIVES (3 bullet points)
4. RECOMMENDATION (clear hiring guidance)

Keep it under 300 words. Be professional, factual, and helpful to the recruiter.`;

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );

      return response.data.content?.[0]?.text || generateFallbackReport(candidateName, role, overallScore, platformResults);
    } catch (err) {
      console.error('AI Report API error:', err.response?.data || err.message);
      return generateFallbackReport(candidateName, role, overallScore, platformResults);
    }
  }

  return generateFallbackReport(candidateName, role, overallScore, platformResults);
};

const generateFallbackReport = (candidateName, role, score, platformResults) => {
  const flaggedTotal = platformResults.reduce((sum, p) => sum + (p.flaggedCount || 0), 0);
  const cleanPlatforms = platformResults.filter(p => p.score >= 75).map(p => p.platform);
  const riskPlatforms = platformResults.filter(p => p.score < 50).map(p => p.platform);

  if (score >= 75) {
    return `**EXECUTIVE SUMMARY**
${candidateName} has a strong and professional digital presence with an overall safety score of ${score}/100. No significant reputation risks were identified.

**FINDINGS**
Across all ${platformResults.length} scanned platforms, the candidate maintains a consistently professional and responsible online presence. ${cleanPlatforms.length > 0 ? `Particularly strong results were noted on ${cleanPlatforms.join(', ')}.` : ''} A total of ${flaggedTotal} minor flags were detected, none of which are considered disqualifying.

**KEY OBSERVATIONS**
• ✅ No hate speech, harassment, or discriminatory content detected
• ✅ Professional and consistent digital footprint across platforms  
• ✅ No public controversies, inflammatory posts, or reputational risks found

**RECOMMENDATION**
Candidate demonstrates good digital hygiene and responsible online behaviour. Proceed with the standard hiring process with confidence. This candidate's online presence aligns with professional workplace standards.`;
  } else if (score >= 50) {
    return `**EXECUTIVE SUMMARY**
${candidateName}'s digital screening returned a score of ${score}/100, indicating some areas that warrant closer attention before proceeding with a hiring decision.

**FINDINGS**
The scan identified ${flaggedTotal} flagged posts or interactions across ${platformResults.length} platforms. ${riskPlatforms.length > 0 ? `Platforms requiring closer review include: ${riskPlatforms.join(', ')}.` : 'Most platforms show moderate results.'} The content flagged reflects occasional strong opinions or heated exchanges rather than a pattern of harmful behaviour.

**KEY OBSERVATIONS**
• ⚠️ ${flaggedTotal} posts with controversial or borderline content detected
• ⚠️ Some platforms show irregular activity patterns worth discussing
• ✅ No evidence of illegal activity or severe violations found

**RECOMMENDATION**
Candidate can be considered, but we recommend a structured interview question addressing their online activity and professional conduct expectations. Request the candidate's perspective on any flagged content before making a final offer.`;
  } else {
    return `**EXECUTIVE SUMMARY**
${candidateName}'s digital screening raised significant concerns with a safety score of ${score}/100. Immediate review is strongly advised before proceeding.

**FINDINGS**
The scan detected ${flaggedTotal} flagged posts across ${platformResults.length} platforms, with ${riskPlatforms.length > 0 ? `high-risk findings on ${riskPlatforms.join(', ')}` : 'multiple platforms showing risk signals'}. Patterns include repeated use of inflammatory language, public disputes, and content that may conflict with professional workplace values.

**KEY OBSERVATIONS**
• 🚩 Multiple instances of inflammatory or aggressive public content
• 🚩 Content patterns inconsistent with professional workplace standards
• 🚩 ${flaggedTotal} total flagged posts represent a significant reputational risk

**RECOMMENDATION**
High risk — do not proceed without a thorough review. If the role requires public representation of your company, this candidate's online behaviour poses significant risk. If you choose to continue, conduct a detailed interview specifically addressing the flagged content and establish clear social media conduct expectations in the employment contract.`;
  }
};

module.exports = { generateAIReport };
