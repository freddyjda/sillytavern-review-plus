import { ensureSwipes, syncMesToSwipe } from '../../../../script.js';
import { getContext } from '../../../st-context.js';
import {
    buildCharacterCardContext,
    buildIsolatedReviewMessages,
    buildPersonaCardContext,
    buildRecoverableSwipeState,
    buildReviewPrompt,
    buildRetryReviewPrompt,
    buildReviewedSwipeInfo,
    buildSceneContext,
    classifyReviewedOutput,
    findLatestReviewableMessageIndex,
    findPreviousUserMessage,
    getDefaultReviewPromptTemplate,
    hasValidSwipeState,
    isRetryableReviewError,
    parseReviewedOutput,
} from './review-core.js';

export { MODULE_NAME, ensureReviewPlusShell };

const MODULE_NAME = 'review-plus';
const SETTINGS_CONTAINER_ID = 'review_plus_container';
const SETTINGS_SHELL_ID = 'review_plus_settings_shell';
const STATUS_ID = 'review_plus_status';
const ACTIONS_ID = 'review_plus_actions';
const REVIEW_BUTTON_ID = 'review_plus_review_button';
const TOAST_TITLE = 'Review Plus';
const REVIEW_BUTTON_IDLE_LABEL = 'Review last reply';
const REVIEW_BUTTON_BUSY_LABEL = 'Reviewing...';
const REVIEW_RETRY_ATTEMPTS = 2;
const REVIEW_RETRY_DELAY_MS = 1200;
const HISTORY_MODE_SELECT_ID = 'review_plus_history_mode';
const HISTORY_LIMIT_INPUT_ID = 'review_plus_history_limit';
const OUTPUT_MODE_SELECT_ID = 'review_plus_output_mode';
const PROMPT_EDITOR_ID = 'review_plus_prompt_editor';
const PROMPT_RESET_BUTTON_ID = 'review_plus_prompt_reset';
const INLINE_REVIEW_BUTTON_CLASS = 'review_plus_inline_btn';
const DEFAULT_SETTINGS = Object.freeze({
    historyMode: 'window',
    historyLimit: 12,
    outputMode: 'json',
    customPrompt: '',
});

function buildSettingsShell() {
    return $(`
        <div id="${SETTINGS_SHELL_ID}" class="reviewPlus_settingsShell">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Review Plus</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="reviewPlus_panel">
                        <div class="reviewPlus_settingGroup">
                            <label class="reviewPlus_settingLabel" for="${HISTORY_MODE_SELECT_ID}">Scene context</label>
                            <select id="${HISTORY_MODE_SELECT_ID}" class="text_pole reviewPlus_settingInput">
                                <option value="window">Last X messages</option>
                                <option value="full">Full history</option>
                            </select>
                        </div>
                        <div class="reviewPlus_settingGroup">
                            <label class="reviewPlus_settingLabel" for="${HISTORY_LIMIT_INPUT_ID}">Message window</label>
                            <input
                                id="${HISTORY_LIMIT_INPUT_ID}"
                                type="number"
                                min="1"
                                step="1"
                                class="text_pole reviewPlus_settingInput"
                            />
                        </div>
                        <div class="reviewPlus_settingGroup">
                            <label class="reviewPlus_settingLabel" for="${OUTPUT_MODE_SELECT_ID}">Output format</label>
                            <select id="${OUTPUT_MODE_SELECT_ID}" class="text_pole reviewPlus_settingInput">
                                <option value="json">JSON (structured)</option>
                                <option value="plain">Plain text</option>
                            </select>
                        </div>
                        <div class="reviewPlus_settingGroup">
                            <label class="reviewPlus_settingLabel" for="${PROMPT_EDITOR_ID}">
                                Review prompt template
                                <span class="reviewPlus_hint">Use {{variable}} placeholders</span>
                            </label>
                            <textarea
                                id="${PROMPT_EDITOR_ID}"
                                class="text_pole reviewPlus_promptEditor"
                                rows="12"
                                spellcheck="false"
                                placeholder="Enter custom review prompt template..."
                            ></textarea>
                            <div class="reviewPlus_promptVariables">
                                <span class="reviewPlus_variableTag" data-variable="{{reviewMode}}">{{reviewMode}}</span>
                                <span class="reviewPlus_variableTag" data-variable="{{characterCard}}">{{characterCard}}</span>
                                <span class="reviewPlus_variableTag" data-variable="{{personaCard}}">{{personaCard}}</span>
                                <span class="reviewPlus_variableTag" data-variable="{{sceneContext}}">{{sceneContext}}</span>
                                <span class="reviewPlus_variableTag" data-variable="{{lastUserMessage}}">{{lastUserMessage}}</span>
                                <span class="reviewPlus_variableTag" data-variable="{{lastAssistantMessage}}">{{lastAssistantMessage}}</span>
                            </div>
                            <button
                                id="${PROMPT_RESET_BUTTON_ID}"
                                type="button"
                                class="menu_button interactable reviewPlus_resetButton"
                            >
                                Reset to default
                            </button>
                        </div>
                        <div id="${STATUS_ID}" class="reviewPlus_status" data-state="idle" aria-live="polite">
                            Review the latest AI reply before generating a replacement.
                        </div>
                        <div id="${ACTIONS_ID}" class="reviewPlus_actions">
                            <button
                                id="${REVIEW_BUTTON_ID}"
                                type="button"
                                class="menu_button interactable reviewPlus_reviewButton"
                                data-idle-label="${REVIEW_BUTTON_IDLE_LABEL}"
                                data-busy-label="${REVIEW_BUTTON_BUSY_LABEL}"
                            >
                                ${REVIEW_BUTTON_IDLE_LABEL}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
}

function getSettingsHost() {
    let host = $(document.getElementById(SETTINGS_CONTAINER_ID));
    if (!host.length) {
        const extensionsSettings = $('#extensions_settings2');
        if (extensionsSettings.length) {
            host = $(`<div id="${SETTINGS_CONTAINER_ID}" class="extension_container"></div>`);
            extensionsSettings.prepend(host);
        }
    }
    return host;
}

function getStatusElement() {
    return $(document.getElementById(STATUS_ID));
}

function getReviewButton() {
    return $(document.getElementById(REVIEW_BUTTON_ID));
}

function getHistoryModeSelect() {
    return $(document.getElementById(HISTORY_MODE_SELECT_ID));
}

function getHistoryLimitInput() {
    return $(document.getElementById(HISTORY_LIMIT_INPUT_ID));
}

function getOutputModeSelect() {
    return $(document.getElementById(OUTPUT_MODE_SELECT_ID));
}

function getPromptEditor() {
    return $(document.getElementById(PROMPT_EDITOR_ID));
}

function getPromptResetButton() {
    return $(document.getElementById(PROMPT_RESET_BUTTON_ID));
}

function getReviewSettings(context = getContext()) {
    const moduleSettings = context.extensionSettings?.[MODULE_NAME] ?? {};
    const rawLimit = Number(moduleSettings.historyLimit);

    return {
        historyMode: moduleSettings.historyMode === 'full' ? 'full' : DEFAULT_SETTINGS.historyMode,
        historyLimit: Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_SETTINGS.historyLimit,
        outputMode: moduleSettings.outputMode === 'plain' ? 'plain' : DEFAULT_SETTINGS.outputMode,
        customPrompt: String(moduleSettings.customPrompt ?? DEFAULT_SETTINGS.customPrompt),
    };
}

function updateHistoryLimitState(settings = getReviewSettings()) {
    const historyLimitInput = getHistoryLimitInput();
    if (!historyLimitInput.length) {
        return;
    }

    const disableLimit = settings.historyMode === 'full';
    historyLimitInput.prop('disabled', disableLimit);
    historyLimitInput.attr('aria-disabled', String(disableLimit));
}

function loadReviewSettings(context = getContext()) {
    const settings = getReviewSettings(context);
    const historyModeSelect = getHistoryModeSelect();
    const historyLimitInput = getHistoryLimitInput();
    const outputModeSelect = getOutputModeSelect();
    const promptEditor = getPromptEditor();

    if (historyModeSelect.length) {
        historyModeSelect.val(settings.historyMode);
    }

    if (historyLimitInput.length) {
        historyLimitInput.val(String(settings.historyLimit));
    }

    if (outputModeSelect.length) {
        outputModeSelect.val(settings.outputMode);
    }

    if (promptEditor.length) {
        const promptValue = settings.customPrompt || getDefaultReviewPromptTemplate();
        promptEditor.val(promptValue);
    }

    updateHistoryLimitState(settings);
}

function persistReviewSettings(partialSettings = {}, context = getContext()) {
    context.extensionSettings[MODULE_NAME] ??= {};
    Object.assign(context.extensionSettings[MODULE_NAME], getReviewSettings(context), partialSettings);
    context.saveSettingsDebounced?.();
    loadReviewSettings(context);
}

function setReviewButtonBusy(isBusy) {
    const reviewButton = getReviewButton();

    if (!reviewButton.length) {
        return;
    }

    reviewButton.prop('disabled', isBusy);
    reviewButton.attr('aria-busy', String(Boolean(isBusy)));
    reviewButton.toggleClass('reviewPlus_reviewButton--busy', Boolean(isBusy));
    reviewButton.text(isBusy
        ? reviewButton.attr('data-busy-label') || REVIEW_BUTTON_BUSY_LABEL
        : reviewButton.attr('data-idle-label') || REVIEW_BUTTON_IDLE_LABEL);
}

function setStatus(message, state = 'idle') {
    const status = getStatusElement();

    if (!status.length) {
        return;
    }

    status.text(String(message ?? ''));
    status.attr('data-state', state);
}

function showToast(level, message) {
    const toastMethod = globalThis.toastr?.[level];

    if (typeof toastMethod === 'function') {
        toastMethod(message, TOAST_TITLE, { preventDuplicates: true });
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function openReviewPopup() {
    const dialog = document.createElement('dialog');
    dialog.className = 'reviewPlus_popup';
    dialog.innerHTML = `
        <form method="dialog" class="reviewPlus_popupForm">
            <div class="reviewPlus_popupHeader">Review last reply</div>
            <div class="reviewPlus_popupBody">
                Leave blank to auto-detect contradictions, random drama, and out-of-character behavior.
            </div>
            <textarea
                class="text_pole reviewPlus_popupInput"
                rows="8"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
            ></textarea>
            <div class="reviewPlus_popupActions">
                <button type="button" class="menu_button" data-action="cancel">Cancel</button>
                <button type="submit" class="menu_button menu_button_primary" data-action="confirm">Review</button>
            </div>
        </form>
    `;

    const form = dialog.querySelector('form');
    const textarea = dialog.querySelector('textarea');
    const cancelButton = dialog.querySelector('[data-action="cancel"]');

    return await new Promise(resolve => {
        let resolved = false;

        const finish = value => {
            if (resolved) {
                return;
            }

            resolved = true;
            dialog.remove();
            resolve(value);
        };

        cancelButton?.addEventListener('click', () => {
            dialog.close('cancel');
        });

        dialog.addEventListener('close', () => {
            finish(dialog.returnValue === 'cancel' ? null : String(textarea?.value ?? ''));
        }, { once: true });

        dialog.addEventListener('cancel', () => {
            dialog.returnValue = 'cancel';
        });

        form?.addEventListener('submit', event => {
            event.preventDefault();
            dialog.close('confirm');
        });

        document.body.append(dialog);
        dialog.showModal();
        textarea?.focus();
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

async function openUnchangedResultPopup({ originalReply, reviewedText }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'reviewPlus_popup reviewPlus_popup--wide';
    dialog.innerHTML = `
        <form method="dialog" class="reviewPlus_popupForm">
            <div class="reviewPlus_popupHeader">Review output inspection</div>
            <div class="reviewPlus_popupBody">
                Review Plus received a reply that compared equal to the original after the stricter retry.
                This usually points to the generation pipeline ignoring the correction request or returning the current reply back unchanged.
            </div>
            <div class="reviewPlus_popupCompareMeta">
                <div>Original: ${String(originalReply ?? '').length} chars</div>
                <div>Generated: ${String(reviewedText ?? '').length} chars</div>
            </div>
            <div class="reviewPlus_popupCompare">
                <label class="reviewPlus_popupCompareColumn">
                    <span>Original reply</span>
                    <textarea class="text_pole reviewPlus_popupInput" rows="10" readonly>${escapeHtml(originalReply)}</textarea>
                </label>
                <label class="reviewPlus_popupCompareColumn">
                    <span>Generated review output</span>
                    <textarea class="text_pole reviewPlus_popupInput" rows="10" readonly>${escapeHtml(reviewedText)}</textarea>
                </label>
            </div>
            <div class="reviewPlus_popupActions">
                <button type="button" class="menu_button" data-action="close">Close</button>
                <button type="button" class="menu_button" data-action="force">Force swipe anyway</button>
            </div>
        </form>
    `;

    const closeButton = dialog.querySelector('[data-action="close"]');
    const forceButton = dialog.querySelector('[data-action="force"]');

    return await new Promise(resolve => {
        let resolved = false;

        const finish = value => {
            if (resolved) {
                return;
            }

            resolved = true;
            dialog.remove();
            resolve(value);
        };

        closeButton?.addEventListener('click', () => dialog.close('close'));
        forceButton?.addEventListener('click', () => dialog.close('force'));

        dialog.addEventListener('close', () => {
            finish(dialog.returnValue === 'force');
        }, { once: true });

        dialog.addEventListener('cancel', () => {
            dialog.returnValue = 'close';
        });

        document.body.append(dialog);
        dialog.showModal();
        closeButton?.focus();
    });
}

function getLatestReviewTarget(context = getContext()) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const targetMessageIndex = findLatestReviewableMessageIndex(chat);

    if (targetMessageIndex === null) {
        return null;
    }

    return {
        message: chat[targetMessageIndex],
        messageIndex: targetMessageIndex,
    };
}

function isGenerationInProgress() {
    return $('#mes_stop').is(':visible');
}

function getTargetCharacterCard(context, targetMessage) {
    const targetAvatar = String(targetMessage?.original_avatar ?? '').trim();
    const fallbackChid = context.characterId;
    const characters = Array.isArray(context.characters) ? context.characters : [];
    const resolvedChid = targetAvatar
        ? characters.findIndex(character => character?.avatar === targetAvatar)
        : fallbackChid;
    const chid = resolvedChid >= 0 ? resolvedChid : fallbackChid;
    const fields = typeof context.getCharacterCardFields === 'function'
        ? context.getCharacterCardFields({ chid })
        : {};

    return buildCharacterCardContext({
        characterName: targetMessage?.name ?? characters?.[chid]?.name ?? context.name2,
        description: fields?.description,
        personality: fields?.personality,
        scenario: fields?.scenario,
        firstMessage: fields?.firstMessage,
        mesExamples: fields?.mesExamples,
        creatorNotes: fields?.creatorNotes,
        system: fields?.system,
        jailbreak: fields?.jailbreak,
        charDepthPrompt: fields?.charDepthPrompt,
        alternateGreetings: fields?.alternateGreetings,
    });
}

function getPersonaCard(context) {
    const fields = typeof context.getCharacterCardFields === 'function'
        ? context.getCharacterCardFields({ chid: context.characterId })
        : {};
    const powerUser = context.powerUserSettings ?? {};

    return buildPersonaCardContext({
        userName: context.name1,
        persona: fields?.persona ?? powerUser.persona_description,
    });
}

function prepareSwipeStateForReview(messageId, message) {
    if (!message) {
        return false;
    }

    ensureSwipes(message);

    if (!hasValidSwipeState(message)) {
        const recoverableSwipeState = buildRecoverableSwipeState(message);
        message.swipes = recoverableSwipeState.swipes;
        message.swipe_info = recoverableSwipeState.swipe_info;
        message.swipe_id = recoverableSwipeState.swipe_id;
    }

    return hasValidSwipeState(message) ? syncMesToSwipe(messageId) : false;
}

async function appendReviewedSwipe(context, messageId, reviewedText, reasoning = '') {
    const message = context?.chat?.[messageId];

    if (!message) {
        throw new Error('Review target is no longer available.');
    }

    if (!prepareSwipeStateForReview(messageId, message)) {
        throw new Error('Unable to prepare swipe state for review.');
    }

    message.swipes.push(reviewedText);
    message.swipe_info.push(buildReviewedSwipeInfo(message, { reasoning }));

    const newSwipeId = message.swipes.length - 1;
    message.swipe_id = newSwipeId;
    message.mes = message.swipes[newSwipeId];
    message.send_date = message.swipe_info[newSwipeId].send_date;
    message.gen_started = message.swipe_info[newSwipeId].gen_started;
    message.gen_finished = message.swipe_info[newSwipeId].gen_finished;
    message.extra = structuredClone(message.swipe_info[newSwipeId].extra);

    await context.saveChat();
    await context.reloadCurrentChat();
}

async function generateReviewOutputWithRetry(context, prompt, { onRetry, signal, outputMode = 'json', hasCustomPrompt = false } = {}) {
    let lastError;

    for (let attempt = 1; attempt <= REVIEW_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await generateIsolatedReviewOutput(context, prompt, signal, outputMode, hasCustomPrompt);
        } catch (error) {
            lastError = error;

            if (!isRetryableReviewError(error) || attempt >= REVIEW_RETRY_ATTEMPTS) {
                throw error;
            }

            onRetry?.(attempt, error);
            await delay(REVIEW_RETRY_DELAY_MS);
        }
    }

    throw lastError ?? new Error('Review generation failed without a result.');
}

async function generateIsolatedReviewOutput(context, reviewPrompt, signal, outputMode = 'json', hasCustomPrompt = false) {
    const reviewMessages = buildIsolatedReviewMessages(reviewPrompt, outputMode, hasCustomPrompt);
    return String(await context.generateRaw({
        prompt: reviewMessages,
        api: context.mainApi,
        instructOverride: true,
        trimNames: false,
        jsonSchema: null,
    }) ?? '').trim();
}

async function handleReviewClick() {
    if (isGenerationInProgress()) {
        setStatus('Another generation is already in progress. Wait for it to finish before reviewing.', 'warning');
        showToast('warning', 'Another generation is already in progress.');
        return;
    }

    setStatus('Waiting for review notes. Leave the popup blank to auto-detect scene problems.', 'working');
    const critique = await openReviewPopup();

    if (critique === null) {
        setStatus('Review cancelled. No changes were made.', 'idle');
        return;
    }

    const context = getContext();
    const target = getLatestReviewTarget(context);

    if (!target) {
        setStatus('No reviewable AI reply was found in the current chat.', 'warning');
        showToast('warning', 'No reviewable AI reply was found in the current chat.');
        return;
    }

    if (typeof context.generateRaw !== 'function') {
        setStatus('Review generation is unavailable in the current context.', 'error');
        showToast('error', 'Review generation is unavailable in the current context.');
        return;
    }

    const reviewMode = String(critique).trim() ? 'manual' : 'automatic';
    const reviewSettings = getReviewSettings(context);
    const outputMode = reviewSettings.outputMode;
    const sceneContext = buildSceneContext(context.chat, target.messageIndex, {
        mode: reviewSettings.historyMode,
        maxMessages: reviewSettings.historyLimit,
    });
    const lastUserMessage = findPreviousUserMessage(context.chat, target.messageIndex);
    const characterCard = getTargetCharacterCard(context, target.message);
    const personaCard = getPersonaCard(context);
    const customTemplate = reviewSettings.customPrompt || null;
    const hasCustomPrompt = Boolean(customTemplate);
    const reviewPrompt = buildReviewPrompt({
        sceneContext,
        lastUserMessage,
        lastAssistantMessage: target.message?.mes,
        characterCard,
        personaCard,
        critique,
        customTemplate,
        outputMode,
    });
    const originalReply = String(target.message?.mes ?? '').trim();
    setReviewButtonBusy(true);
    setStatus(`Generating a ${reviewMode} reviewed replacement for AI message #${target.messageIndex} with isolated judge mode...`, 'working');

    try {
        context.deactivateSendButtons?.();

        let reviewedOutput = await generateReviewOutputWithRetry(context, reviewPrompt, {
            onRetry: (attempt, error) => {
                const retryMessage = `Review attempt ${attempt} failed with a transient backend error (${error.message}). Retrying...`;
                setStatus(retryMessage, 'working');
                showToast('warning', retryMessage);
            },
            outputMode,
            hasCustomPrompt,
        });
        let parsedOutput = parseReviewedOutput(reviewedOutput, outputMode);
        let validation = classifyReviewedOutput(reviewedOutput, outputMode);

        if (validation.isValid && parsedOutput.reply === originalReply) {
            setStatus('The first review matched the original reply. Retrying with stricter rewrite instructions...', 'working');

            reviewedOutput = await generateReviewOutputWithRetry(context, buildRetryReviewPrompt({
                    originalPrompt: reviewPrompt,
                    critique,
                }), {
                onRetry: (attempt, error) => {
                    const retryMessage = `Stricter review attempt ${attempt} failed with a transient backend error (${error.message}). Retrying...`;
                    setStatus(retryMessage, 'working');
                    showToast('warning', retryMessage);
                },
                outputMode,
                hasCustomPrompt,
            });
            parsedOutput = parseReviewedOutput(reviewedOutput, outputMode);
            validation = classifyReviewedOutput(reviewedOutput, outputMode);
        }

        if (!validation.isValid) {
            const invalidOutputMessage = validation.reason === 'meta'
                ? 'The reviewed replacement looked like meta output instead of a repaired reply, so the original reply was kept.'
                : validation.reason === 'format'
                    ? outputMode === 'plain'
                        ? 'The reviewed replacement did not include the expected format (Reply: ...), so the original reply was kept.'
                        : 'The reviewed replacement did not include the required evidence-based JSON review structure, so the original reply was kept.'
                    : validation.reason === 'analysis'
                        ? 'The reviewed replacement did not include at least 200 characters of factual analysis, so the original reply was kept.'
                        : 'The reviewed replacement was empty, so the original reply was kept.';
            setStatus(invalidOutputMessage, 'warning');
            showToast('warning', invalidOutputMessage);
            return;
        }

        if (parsedOutput.reply === originalReply) {
            const shouldForceSwipe = await openUnchangedResultPopup({
                originalReply,
                reviewedText: reviewedOutput,
            });

            if (!shouldForceSwipe) {
                const unchangedMessage = String(critique).trim()
                    ? 'The model returned the original reply unchanged even after a stricter retry, so the original reply was kept.'
                    : 'The auto-review returned the original reply unchanged even after a stricter retry, so the original reply was kept.';
                setStatus(unchangedMessage, 'warning');
                showToast('warning', unchangedMessage);
                return;
            }
        }

        await appendReviewedSwipe(context, target.messageIndex, parsedOutput.reply, parsedOutput.analysis);

        setStatus(`Generated and activated a ${reviewMode} reviewed swipe for AI message #${target.messageIndex}.`, 'ready');
        showToast('success', 'Reviewed replacement added as a new active swipe.');
    } catch (error) {
        console.error(`${MODULE_NAME}: failed to generate reviewed swipe`, error);
        const wasAborted = error?.name === 'AbortError';
        const failureMessage = wasAborted
            ? 'Review generation was stopped. The original reply was left unchanged.'
            : isRetryableReviewError(error)
            ? `The review request reached the backend, but it kept failing with a transient upstream error (${error.message}). The original reply was left unchanged.`
            : 'Review generation failed. The original reply was left unchanged.';
        setStatus(failureMessage, wasAborted ? 'warning' : 'error');
        showToast(wasAborted ? 'warning' : 'error', failureMessage);
    } finally {
        context.activateSendButtons?.();
        setReviewButtonBusy(false);
    }
}

function wireReviewControls() {
    const reviewButton = getReviewButton();
    const historyModeSelect = getHistoryModeSelect();
    const historyLimitInput = getHistoryLimitInput();
    const outputModeSelect = getOutputModeSelect();
    const promptEditor = getPromptEditor();
    const promptResetButton = getPromptResetButton();

    if (!reviewButton.length) {
        return;
    }

    reviewButton.off(`click.${MODULE_NAME}`).on(`click.${MODULE_NAME}`, async () => {
        try {
            await handleReviewClick();
        } catch (error) {
            console.error(`${MODULE_NAME}: review request failed`, error);
            setStatus('Review request failed. The original reply was left unchanged.', 'error');
            showToast('error', 'Review request failed. The original reply was left unchanged.');
        }
    });

    historyModeSelect.off(`change.${MODULE_NAME}`).on(`change.${MODULE_NAME}`, function () {
        persistReviewSettings({ historyMode: String($(this).val() || DEFAULT_SETTINGS.historyMode) });
    });

    historyLimitInput.off(`input.${MODULE_NAME}`).on(`input.${MODULE_NAME}`, function () {
        const nextLimit = Number($(this).val());
        persistReviewSettings({
            historyLimit: Number.isInteger(nextLimit) && nextLimit > 0 ? nextLimit : DEFAULT_SETTINGS.historyLimit,
        });
    });

    outputModeSelect.off(`change.${MODULE_NAME}`).on(`change.${MODULE_NAME}`, function () {
        persistReviewSettings({ outputMode: String($(this).val() || DEFAULT_SETTINGS.outputMode) });
    });

    promptEditor.off(`input.${MODULE_NAME}`).on(`input.${MODULE_NAME}`, function () {
        persistReviewSettings({ customPrompt: String($(this).val() || '') });
    });

    promptResetButton.off(`click.${MODULE_NAME}`).on(`click.${MODULE_NAME}`, function () {
        const defaultTemplate = getDefaultReviewPromptTemplate();
        promptEditor.val(defaultTemplate);
        persistReviewSettings({ customPrompt: '' });
        showToast('info', 'Review prompt reset to default.');
    });

    $(document).off(`click.${MODULE_NAME}`, '.reviewPlus_variableTag');
    $(document).on(`click.${MODULE_NAME}`, '.reviewPlus_variableTag', function () {
        const variable = $(this).data('variable');
        if (!variable || !promptEditor.length) return;

        const textarea = promptEditor[0];
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentValue = promptEditor.val();
        const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
        promptEditor.val(newValue);
        persistReviewSettings({ customPrompt: newValue });

        const newCursorPos = start + variable.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    });
}

function injectInlineReviewButton() {
    const buttonHtml = `<div title="Review this reply" class="mes_button ${INLINE_REVIEW_BUTTON_CLASS} fa-solid fa-magnifying-glass" data-i18n="[title]Review this reply"></div>`;

    const templateButton = $(`#message_template .mes_buttons .${INLINE_REVIEW_BUTTON_CLASS}`);
    if (!templateButton.length) {
        $(`#message_template .mes_buttons`).append(buttonHtml);
    }

    $('#chat .mes').each(function () {
        const mesButtons = $(this).find('.mes_buttons');
        if (!mesButtons.find(`.${INLINE_REVIEW_BUTTON_CLASS}`).length) {
            mesButtons.append(buttonHtml);
        }
    });
}

function handleInlineReviewClick(mesElement) {
    const mesId = mesElement.attr('mesid');
    const isUser = mesElement.attr('is_user') === 'true';

    if (isUser) {
        showToast('warning', 'Review can only process AI messages.');
        return;
    }

    const context = getContext();
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const messageIndex = parseInt(mesId, 10);

    if (isNaN(messageIndex) || messageIndex < 0 || messageIndex >= chat.length) {
        showToast('error', 'Invalid message.');
        return;
    }

    const message = chat[messageIndex];
    if (!message || message.is_user || message.is_system) {
        showToast('warning', 'This message cannot be reviewed.');
        return;
    }

    handleReviewClickForMessage(messageIndex, message);
}

async function handleReviewClickForMessage(messageIndex, message) {
    if (isGenerationInProgress()) {
        setStatus('Another generation is already in progress. Wait for it to finish before reviewing.', 'warning');
        showToast('warning', 'Another generation is already in progress.');
        return;
    }

    setStatus('Waiting for review notes. Leave the popup blank to auto-detect scene problems.', 'working');
    const critique = await openReviewPopup();

    if (critique === null) {
        setStatus('Review cancelled. No changes were made.', 'idle');
        return;
    }

    const context = getContext();

    if (typeof context.generateRaw !== 'function') {
        setStatus('Review generation is unavailable in the current context.', 'error');
        showToast('error', 'Review generation is unavailable in the current context.');
        return;
    }

    const reviewMode = String(critique).trim() ? 'manual' : 'automatic';
    const reviewSettings = getReviewSettings(context);
    const outputMode = reviewSettings.outputMode;
    const sceneContext = buildSceneContext(context.chat, messageIndex, {
        mode: reviewSettings.historyMode,
        maxMessages: reviewSettings.historyLimit,
    });
    const lastUserMessage = findPreviousUserMessage(context.chat, messageIndex);
    const characterCard = getTargetCharacterCard(context, message);
    const personaCard = getPersonaCard(context);
    const customTemplate = reviewSettings.customPrompt || null;
    const hasCustomPrompt = Boolean(customTemplate);
    const reviewPrompt = buildReviewPrompt({
        sceneContext,
        lastUserMessage,
        lastAssistantMessage: message?.mes,
        characterCard,
        personaCard,
        critique,
        customTemplate,
        outputMode,
    });
    const originalReply = String(message?.mes ?? '').trim();
    setReviewButtonBusy(true);
    setStatus(`Generating a ${reviewMode} reviewed replacement for AI message #${messageIndex} with isolated judge mode...`, 'working');

    try {
        context.deactivateSendButtons?.();

        let reviewedOutput = await generateReviewOutputWithRetry(context, reviewPrompt, {
            onRetry: (attempt, error) => {
                const retryMessage = `Review attempt ${attempt} failed with a transient backend error (${error.message}). Retrying...`;
                setStatus(retryMessage, 'working');
                showToast('warning', retryMessage);
            },
            outputMode,
            hasCustomPrompt,
        });
        let parsedOutput = parseReviewedOutput(reviewedOutput, outputMode);
        let validation = classifyReviewedOutput(reviewedOutput, outputMode);

        if (validation.isValid && parsedOutput.reply === originalReply) {
            setStatus('The first review matched the original reply. Retrying with stricter rewrite instructions...', 'working');

            reviewedOutput = await generateReviewOutputWithRetry(context, buildRetryReviewPrompt({
                    originalPrompt: reviewPrompt,
                    critique,
                }), {
                onRetry: (attempt, error) => {
                    const retryMessage = `Stricter review attempt ${attempt} failed with a transient backend error (${error.message}). Retrying...`;
                    setStatus(retryMessage, 'working');
                    showToast('warning', retryMessage);
                },
                outputMode,
                hasCustomPrompt,
            });
            parsedOutput = parseReviewedOutput(reviewedOutput, outputMode);
            validation = classifyReviewedOutput(reviewedOutput, outputMode);
        }

        if (!validation.isValid) {
            const invalidOutputMessage = validation.reason === 'meta'
                ? 'The reviewed replacement looked like meta output instead of a repaired reply, so the original reply was kept.'
                : validation.reason === 'format'
                    ? outputMode === 'plain'
                        ? 'The reviewed replacement did not include the expected format (Reply: ...), so the original reply was kept.'
                        : 'The reviewed replacement did not include the required evidence-based JSON review structure, so the original reply was kept.'
                    : validation.reason === 'analysis'
                        ? 'The reviewed replacement did not include at least 200 characters of factual analysis, so the original reply was kept.'
                        : 'The reviewed replacement was empty, so the original reply was kept.';
            setStatus(invalidOutputMessage, 'warning');
            showToast('warning', invalidOutputMessage);
            return;
        }

        if (parsedOutput.reply === originalReply) {
            const shouldForceSwipe = await openUnchangedResultPopup({
                originalReply,
                reviewedText: reviewedOutput,
            });

            if (!shouldForceSwipe) {
                const unchangedMessage = String(critique).trim()
                    ? 'The model returned the original reply unchanged even after a stricter retry, so the original reply was kept.'
                    : 'The auto-review returned the original reply unchanged even after a stricter retry, so the original reply was kept.';
                setStatus(unchangedMessage, 'warning');
                showToast('warning', unchangedMessage);
                return;
            }
        }

        await appendReviewedSwipe(context, messageIndex, parsedOutput.reply, parsedOutput.analysis);

        setStatus(`Generated and activated a ${reviewMode} reviewed swipe for AI message #${messageIndex}.`, 'ready');
        showToast('success', 'Reviewed replacement added as a new active swipe.');
    } catch (error) {
        console.error(`${MODULE_NAME}: failed to generate reviewed swipe`, error);
        const wasAborted = error?.name === 'AbortError';
        const failureMessage = wasAborted
            ? 'Review generation was stopped. The original reply was left unchanged.'
            : isRetryableReviewError(error)
            ? `The review request reached the backend, but it kept failing with a transient upstream error (${error.message}). The original reply was left unchanged.`
            : 'Review generation failed. The original reply was left unchanged.';
        setStatus(failureMessage, wasAborted ? 'warning' : 'error');
        showToast(wasAborted ? 'warning' : 'error', failureMessage);
    } finally {
        context.activateSendButtons?.();
        setReviewButtonBusy(false);
    }
}

function ensureReviewPlusShell() {
    const host = getSettingsHost();

    if (!host.length) {
        return;
    }

    if (!document.getElementById(SETTINGS_SHELL_ID)) {
        host.append(buildSettingsShell());
    }

    loadReviewSettings();
    wireReviewControls();
    injectInlineReviewButton();

    $(document).off(`click.${MODULE_NAME}`, `.${INLINE_REVIEW_BUTTON_CLASS}`);
    $(document).on(`click.${MODULE_NAME}`, `.${INLINE_REVIEW_BUTTON_CLASS}`, function (e) {
        e.stopPropagation();
        const mesElement = $(this).closest('.mes');
        handleInlineReviewClick(mesElement);
    });
}

jQuery(function () {
    ensureReviewPlusShell();
});
