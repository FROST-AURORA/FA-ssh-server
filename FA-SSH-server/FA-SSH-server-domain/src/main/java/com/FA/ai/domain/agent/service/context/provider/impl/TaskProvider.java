package com.FA.ai.domain.agent.service.context.provider.impl;

import com.FA.ai.domain.agent.service.context.provider.ContextProvider;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 任务上下文提供者（order=20）
 * <p>
 * 功能：从消息历史中提取首条 user 消息作为"当前任务描述"，
 * 让模型在长对话、多轮工具调用后仍能记住最初的目标（防"任务漂移" - 面试考点）。
 * <p>
 * 运行过程：
 * <pre>
 *   messageHistory（时间正序）
 *   +----------------------------------------------------+
 *   | [0] user:      "帮我排查 nginx 502"   <--+ 初始目标 |
 *   | [1] assistant: "好的，先看日志..."         |          |
 *   | [2] tool:      "tail -100 error.log..."  |          |
 *   | [3] assistant: "发现 upstream 超时..."   |          |
 *   | ...（几十轮后，模型容易忘记最初任务）       |          |
 *   +----------------------------------------------------+
 *                     |
 *                     v  TaskProvider.provide()
 *            优先从 originalUserTask 获取，否则从前往后找第一条 role=user
 *                     |
 *                     v
 *        Map{ taskDescription: "帮我排查 nginx 502" }
 *                     |
 *                     v
 *   DynamicPromptBuilder 渲染为消息前缀的 [当前任务] 段落
 *   --> 每轮对话都提醒模型"你最初的任务是什么"
 * </pre>
 * 设计说明：取"首条"而非"最近"——首条用户消息代表会话的初始目标；
 * 后续 user 消息多为补充/纠偏，已由 MilestoneProvider 覆盖。
 * 为了防止多轮对话中历史被裁剪或者被动态前缀污染，
 * 在 RootNode 初始化时已经将原始用户任务提取并存入 DynamicContext（可扩展从缓存中读取稳定任务源）。
 */
@Component
public class TaskProvider implements ContextProvider {

    @Override
    public String getName() {
        return "task";
    }

    @Override
    public int getOrder() {
        return 20;
    }

    @Override
    public boolean enabled() {
        return true;
    }

    @Override
    public Map<String, Object> provide(String sessionId, String userId, String terminalSessionId, List<Map<String, Object>> messageHistory) {
        Map<String, Object> result = new HashMap<>();

        // 目前为了向后兼容且防范前缀污染，依然从 history 中找第一条，
        // 这里我们先对可能带前缀的 user message 做一次简单清洗。

        if (messageHistory != null) {
            messageHistory.stream()
                    .filter(m -> "user".equals(m.get("role")))
                    .findFirst()
                    .ifPresent(m -> {
                        String content = (String) m.get("content");
                        if (content != null) {
                            result.put("taskDescription", stripDynamicPrefix(content));
                        }
                    });
        }

        return result;
    }

    private String stripDynamicPrefix(String text) {
        if (text == null) return null;
        if (text.contains("\n---\n")) {
            String[] parts = text.split("\\n---\\n", 2);
            return parts.length == 2 ? parts[1].trim() : text;
        }
        return text;
    }
}