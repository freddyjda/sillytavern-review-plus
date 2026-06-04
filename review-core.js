const REVIEW_ISSUE_TYPES = [
    'invented_fact',
    'ignored_user_action',
    'ignored_user_dialogue',
    'forgotten_context',
    'out_of_character',
    'unjustified_escalation',
    'relational_logic_error',
];

export function isReviewableMessage(message) {
    if (!message) return false;
    if (message.is_user || message.is_system) return false;
    if (message.extra?.type === 'narrator') return false;

    const text = String(message.mes ?? '').trim();
    if (!text || text === '...') return false;

    return true;
}

export function findLatestReviewableMessageIndex(messages) {
    if (!Array.isArray(messages)) return null;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (isReviewableMessage(messages[index])) {
            return index;
        }
    }

    return null;
}

export function hasValidSwipeState(message) {
    if (!message || typeof message.swipe_id !== 'number') return false;
    if (!Array.isArray(message.swipes) || !Array.isArray(message.swipe_info)) return false;

    const currentSwipe = message.swipes[message.swipe_id];
    const currentSwipeInfo = message.swipe_info[message.swipe_id];

    return typeof currentSwipe === 'string' && Boolean(currentSwipeInfo) && typeof currentSwipeInfo === 'object';
}

export function buildInitialSwipeState(message) {
    return {
        swipes: [String(message?.mes ?? '')],
        swipe_info: [{
            send_date: message?.send_date ?? null,
            gen_started: message?.gen_started ?? null,
            gen_finished: message?.gen_finished ?? null,
            extra: { ...(message?.extra ?? {}) },
        }],
        swipe_id: 0,
    };
}

export function buildRecoverableSwipeState(message) {
    const fallbackState = buildInitialSwipeState(message);
    const hasExistingSwipes = Array.isArray(message?.swipes) && message.swipes.length > 0;

    if (!hasExistingSwipes) {
        return fallbackState;
    }

    return {
        swipes: message.swipes.map(swipe => typeof swipe === 'string' ? swipe : ''),
        swipe_info: message.swipes.map((_, index) => {
            const swipeInfo = message?.swipe_info?.[index];
            if (swipeInfo && typeof swipeInfo === 'object') {
                return swipeInfo;
            }

            return {
                send_date: message?.send_date ?? null,
                gen_started: message?.gen_started ?? null,
                gen_finished: message?.gen_finished ?? null,
                extra: {},
            };
        }),
        swipe_id: typeof message?.swipe_id === 'number' ? message.swipe_id : fallbackState.swipe_id,
    };
}

export function buildReviewedSwipeInfo(message, { timestamp = Date.now(), reasoning = '' } = {}) {
    const nextExtra = { ...(message?.extra ?? {}) };
    delete nextExtra.display_text;
    delete nextExtra.reasoning;
    delete nextExtra.reasoning_duration;
    delete nextExtra.reasoning_signature;
    delete nextExtra.time_to_first_token;
    delete nextExtra.token_count;

    const extra = { ...nextExtra, review_source: 'review-plus' };

    if (String(reasoning || '').trim()) {
        extra.reasoning = String(reasoning).trim();
        extra.reasoning_type = 'manual';
    }

    return {
        send_date: timestamp,
        gen_started: null,
        gen_finished: null,
        extra,
    };
}

function getMessageText(message) {
    const text = String(message?.mes ?? '').trim();
    return text && text !== '...' ? text : '';
}

function isSceneContextMessage(message) {
    if (!message) return false;
    if (message.is_system && message.extra?.type !== 'narrator') return false;

    return getMessageText(message).length > 0;
}

function getSpeakerLabel(message) {
    if (message?.extra?.type === 'narrator') {
        return 'Narrator';
    }

    return message?.is_user ? 'User' : 'Assistant';
}

export function buildSceneContext(messages, targetIndex, { mode = 'window', maxMessages = 12 } = {}) {
    if (!Array.isArray(messages) || !Number.isInteger(targetIndex) || targetIndex <= 0) {
        return '';
    }

    const sceneMessages = [];
    const useFullHistory = mode === 'full';
    const normalizedMaxMessages = Number.isInteger(maxMessages) && maxMessages > 0 ? maxMessages : 12;

    for (let index = targetIndex - 1; index >= 0; index -= 1) {
        const message = messages[index];

        if (!isSceneContextMessage(message)) {
            continue;
        }

        sceneMessages.unshift(`${getSpeakerLabel(message)}: ${getMessageText(message)}`);

        if (!useFullHistory && sceneMessages.length >= normalizedMaxMessages) {
            break;
        }
    }

    return sceneMessages.join('\n');
}

function addCardField(lines, label, value) {
    const text = Array.isArray(value)
        ? value.map(item => String(item ?? '').trim()).filter(Boolean).join('\n')
        : String(value ?? '').trim();

    if (text) {
        lines.push(`${label}: ${text}`);
    }
}

export function buildCharacterCardContext({
    characterName,
    description,
    personality,
    scenario,
    firstMessage,
    mesExamples,
    creatorNotes,
    system,
    jailbreak,
    charDepthPrompt,
    alternateGreetings,
} = {}) {
    const lines = [];

    addCardField(lines, 'Character name', characterName);
    addCardField(lines, 'Description', description);
    addCardField(lines, 'Personality', personality);
    addCardField(lines, 'Scenario', scenario);
    addCardField(lines, 'First message', firstMessage);
    addCardField(lines, 'Example messages', mesExamples);
    addCardField(lines, 'Creator notes', creatorNotes);
    addCardField(lines, 'System prompt', system);
    addCardField(lines, 'Jailbreak', jailbreak);
    addCardField(lines, 'Depth prompt', charDepthPrompt);
    addCardField(lines, 'Alternate greetings', alternateGreetings);

    return lines.join('\n');
}

export function buildPersonaCardContext({
    userName,
    persona,
    personaTitle,
    personaDescription,
} = {}) {
    const lines = [];

    addCardField(lines, 'User name', userName);
    addCardField(lines, 'Persona card', persona);
    addCardField(lines, 'Persona title', personaTitle);
    addCardField(lines, 'Persona description', personaDescription);

    return lines.join('\n');
}

export function findPreviousUserMessage(messages, targetIndex) {
    if (!Array.isArray(messages) || !Number.isInteger(targetIndex) || targetIndex <= 0) {
        return '';
    }

    for (let index = targetIndex - 1; index >= 0; index -= 1) {
        const message = messages[index];

        if (!message?.is_user) {
            continue;
        }

        const text = getMessageText(message);

        if (text) {
            return text;
        }
    }

    return '';
}

export function getDefaultReviewPromptTemplate() {
    return [
        'This is not a new turn.',
        'Rewrite only the previous AI message.',
        'Do not continue the story.',
        'Prefer literal scene coherence over drama, style, or vibes when uncertain.',
        'Do not critique the reply for taste, sexualization, prose quality, tropeiness, or moral aesthetics unless you can tie that directly to explicit scene evidence or stable character traits.',
        'Only flag problems that are grounded in explicit scene evidence or stable character traits. If you cannot cite evidence, do not flag it.',
        'Check basic entity-relation logic before judging tone: who lives with whom, who lives near whom, who knows whom, who is present, who just did what, and whether the reply contradicts its own relation chain.',
        'If A lives with B and B lives near C, do not let A speak as if A lacks that same practical proximity to C unless the context explains the difference.',
        'Treat contradictions inside the last AI message itself as evidence when the reply asserts both sides of an incompatible relation.',
        'Return only a single JSON object with exactly these top-level keys: analysis_steps, issues, clean_reply.',
        'analysis_steps must be an object with exactly these string keys: npc_actions, response_check, logic_check, rewrite_plan.',
        'issues must be an array of objects. Each issue object must contain: type, claim_in_reply, scene_evidence, why_invalid.',
        `Allowed issue types are only: ${REVIEW_ISSUE_TYPES.join(', ')}.`,
        'clean_reply must contain only the cleaned final replacement reply ready to insert into chat.',
        'The combined text inside analysis_steps must be at least 200 characters total.',
        'Step 1 (npc_actions): summarize only NPC dialogue and NPC actions from the relevant scene context. Do not analyze the user here.',
        'Step 2 (response_check): ask whether NPCs are responding appropriately to prior turns, ignoring user dialogue/actions, or forgetting important context.',
        'Step 3 (logic_check): first check internal relation/spatial logic, then ask whether NPCs are acting within their personalities; if not, state whether there is a valid contextual reason or an unsupported hallucination.',
        'Step 4 (rewrite_plan): explain how the final cleaned reply will tie loose ends and remove or rewrite unsupported dialogue/actions.',
        '{{reviewMode}}',
        'NPC character card:\n{{characterCard}}',
        'User persona card:\n{{personaCard}}',
        'Scene context:\n{{sceneContext}}',
        'Last user message:\n{{lastUserMessage}}',
        'Last AI message to repair:\n{{lastAssistantMessage}}',
    ].join('\n\n');
}

export function buildReviewPromptFromTemplate(template, {
    sceneContext,
    lastUserMessage,
    lastAssistantMessage,
    characterCard,
    personaCard,
    critique,
} = {}) {
    const manualCritique = String(critique ?? '').trim();
    const reviewMode = manualCritique
        ? `User critique (authoritative factual guidance):\n${manualCritique}`
        : 'Auto-review mode: detect only evidence-backed contradictions, ignored user input, forgotten context, unjustified escalation, out-of-character behavior, and relational logic errors.';

    const variables = {
        reviewMode,
        characterCard: String(characterCard ?? ''),
        personaCard: String(personaCard ?? ''),
        sceneContext: String(sceneContext ?? ''),
        lastUserMessage: String(lastUserMessage ?? ''),
        lastAssistantMessage: String(lastAssistantMessage ?? ''),
    };

    let result = String(template ?? '');
    for (const [key, value] of Object.entries(variables)) {
        result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
}

export function buildReviewPrompt({
    sceneContext,
    lastUserMessage,
    lastAssistantMessage,
    characterCard,
    personaCard,
    critique,
    customTemplate,
} = {}) {
    const template = customTemplate || getDefaultReviewPromptTemplate();
    return buildReviewPromptFromTemplate(template, {
        sceneContext,
        lastUserMessage,
        lastAssistantMessage,
        characterCard,
        personaCard,
        critique,
    });
}

export function buildIsolatedReviewMessages(reviewPrompt) {
    return [
        {
            role: 'system',
            content: [
                'You are an impartial narrative continuity reviewer.',
                'You are not continuing the roleplay and you are not writing a fresh turn from scratch.',
                'Act like a factual scene judge, not a prose critic.',
                'Ignore trope pressure, preset melodrama, style preferences, and moral-aesthetic commentary unless explicit scene evidence justifies them.',
                'Only judge what actually happened, whether NPC reactions fit established personalities, and whether the reply stays coherent with prior turns.',
                'Return only the requested JSON object.',
            ].join(' '),
        },
        {
            role: 'user',
            content: String(reviewPrompt ?? ''),
        },
    ];
}

export function getReviewJsonSchema() {
    return {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
            analysis_steps: {
                type: 'object',
                properties: {
                    npc_actions: { type: 'string' },
                    response_check: { type: 'string' },
                    logic_check: { type: 'string' },
                    rewrite_plan: { type: 'string' },
                },
                required: ['npc_actions', 'response_check', 'logic_check', 'rewrite_plan'],
                additionalProperties: false,
            },
            issues: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: REVIEW_ISSUE_TYPES,
                        },
                        claim_in_reply: { type: 'string' },
                        scene_evidence: { type: 'string' },
                        why_invalid: { type: 'string' },
                    },
                    required: ['type', 'claim_in_reply', 'scene_evidence', 'why_invalid'],
                    additionalProperties: false,
                },
            },
            clean_reply: { type: 'string' },
        },
        required: ['analysis_steps', 'issues', 'clean_reply'],
        additionalProperties: false,
    };
}

export function buildRetryReviewPrompt({
    originalPrompt,
    critique,
} = {}) {
    const hasManualCritique = Boolean(String(critique ?? '').trim());

    return [
        String(originalPrompt ?? '').trim(),
        'The previous attempt returned the original reply unchanged.',
        'You must rewrite the last AI message so the output is materially different from the original while preserving scene logic.',
        'Do not return the original text again.',
        'Keep the exact same JSON output format.',
        'Do not add any new issue unless you can support it with explicit scene evidence or stable character traits.',
        hasManualCritique
            ? 'Treat the user critique as authoritative factual guidance and make the minimum necessary corrections to obey it.'
            : 'If no correction is needed, keep the reply conservative and evidence-based instead of rewriting for taste.',
    ].join('\n\n');
}

function extractJsonObject(text) {
    const value = String(text || '').trim();

    if (!value) {
        return '';
    }

    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return value;
    }

    return value.slice(firstBrace, lastBrace + 1).trim();
}

function buildStructuredReasoning(analysisSteps, issues) {
    const sections = [
        `Step 1 - NPC actions/dialogue: ${analysisSteps.npc_actions}`,
        `Step 2 - Response check: ${analysisSteps.response_check}`,
        `Step 3 - Logic/personality/escalation: ${analysisSteps.logic_check}`,
        `Step 4 - Rewrite plan: ${analysisSteps.rewrite_plan}`,
    ];

    if (issues.length > 0) {
        sections.push('Evidence-backed issues:');
        issues.forEach((issue, index) => {
            sections.push(`${index + 1}. [${issue.type}] Claim in reply: ${issue.claim_in_reply} | Scene evidence: ${issue.scene_evidence} | Why invalid: ${issue.why_invalid}`);
        });
    } else {
        sections.push('Evidence-backed issues: none. No supported contradiction was found beyond conservative cleanup.');
    }

    return sections.join('\n');
}

function normalizeIssue(rawIssue) {
    if (!rawIssue || typeof rawIssue !== 'object') {
        return null;
    }

    const issue = {
        type: String(rawIssue.type ?? '').trim(),
        claim_in_reply: String(rawIssue.claim_in_reply ?? '').trim(),
        scene_evidence: String(rawIssue.scene_evidence ?? '').trim(),
        why_invalid: String(rawIssue.why_invalid ?? '').trim(),
    };

    return Object.values(issue).every(Boolean) ? issue : null;
}

export function parseReviewedOutput(text) {
    const value = String(text || '').trim();

    if (!value) {
        return { isValid: false, reason: 'empty', analysis: '', reply: '', raw: value };
    }

    if (/^here is the corrected response:/i.test(value)) {
        return { isValid: false, reason: 'meta', analysis: '', reply: '', raw: value };
    }

    const jsonPayload = extractJsonObject(value);
    let parsedJson;

    try {
        parsedJson = JSON.parse(jsonPayload);
    } catch {
        return { isValid: false, reason: 'format', analysis: '', reply: '', raw: value };
    }

    const analysisSteps = parsedJson?.analysis_steps;
    const reply = String(parsedJson?.clean_reply ?? '').trim();
    const issues = Array.isArray(parsedJson?.issues)
        ? parsedJson.issues.map(normalizeIssue).filter(Boolean)
        : null;

    const requiredStepKeys = ['npc_actions', 'response_check', 'logic_check', 'rewrite_plan'];
    const hasValidSteps = analysisSteps
        && typeof analysisSteps === 'object'
        && requiredStepKeys.every(key => String(analysisSteps[key] ?? '').trim());

    if (!hasValidSteps || !reply || !Array.isArray(issues)) {
        return { isValid: false, reason: 'format', analysis: '', reply, raw: value };
    }

    const invalidIssueType = issues.find(issue => !REVIEW_ISSUE_TYPES.includes(issue.type));

    if (invalidIssueType || issues.length !== parsedJson.issues.length) {
        return { isValid: false, reason: 'format', analysis: '', reply, raw: value };
    }

    const analysisCore = requiredStepKeys.map(key => String(analysisSteps[key] ?? '').trim()).join('\n');
    const analysis = buildStructuredReasoning(analysisSteps, issues).trim();

    if (analysisCore.length < 200) {
        return { isValid: false, reason: 'analysis', analysis, reply, raw: value };
    }

    return { isValid: true, reason: 'valid', analysis, reply, raw: value };
}

export function classifyReviewedOutput(text) {
    const parsed = parseReviewedOutput(text);
    return { isValid: parsed.isValid, reason: parsed.reason };
}

export function validateReviewedOutput(text) {
    return classifyReviewedOutput(text).isValid;
}

export function isRetryableReviewError(error) {
    const message = String(error?.message ?? error ?? '').toLowerCase();

    if (!message) {
        return false;
    }

    return [
        'bad gateway',
        'gateway timeout',
        'temporarily overloaded',
        'upstream',
        'timeout',
        'econnreset',
        'socket hang up',
    ].some(fragment => message.includes(fragment));
}

export function sanitizeReviewChatCompletionSettings(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const maxTokens = Number(source.openai_max_tokens);
    const reviewTokenCap = 1500;

    return {
        ...source,
        show_thoughts: false,
        reasoning_effort: 'medium',
        enable_web_search: false,
        request_images: false,
        request_image_resolution: '',
        request_image_aspect_ratio: '',
        custom_prompt_post_processing: '',
        bias_preset_selected: '',
        function_calling: false,
        n: 1,
        stream_openai: true,
        assistant_prefill: '',
        assistant_impersonation: '',
        openai_max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, reviewTokenCap) : reviewTokenCap,
    };
}
