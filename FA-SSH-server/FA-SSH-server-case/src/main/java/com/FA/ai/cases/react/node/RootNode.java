package com.FA.ai.cases.react.node;

import com.FA.ai.api.dto.ChatRequestDTO;
import com.FA.ai.api.dto.ReActResultDTO;
import com.FA.ai.cases.react.AbstractAIAgentReActSupport;
import com.FA.ai.cases.react.factory.DefaultReActFactory;
import cn.bugstack.wrench.design.framework.tree.StrategyHandler;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * ReAct Root Node（根节点）
 *
 * <p>职责：
 * 1. 从 ChatRequestDTO 提取会话参数
 * 2. 初始化 DynamicContext
 * 3. 绑定终端会话 ID（ThreadLocal）
 * 4. 路由到 AiCallNode
 *
 * <p>节点链：
 * RootNode → AiCallNode → ToolCallNode → LoopDecisionNode → UserFeedbackNode
 */
@Slf4j
@Component("reactRootNode")
public class RootNode extends AbstractAIAgentReActSupport {

    private static final int DEFAULT_MAX_STEPS = 50;
    private static final int DEFAULT_MAX_TOOL_CALLS = 200;
    private static final int DEFAULT_MAX_TOOL_CALLS_PER_ROUND = 10;

    @Override
    protected ReActResultDTO doApply(ChatRequestDTO requestParameter, DefaultReActFactory.DynamicContext dynamicContext) throws Exception {
        log.info("ReAct RootNode - 初始化上下文");

        // 1. 提取会话参数
        String sessionId = requestParameter.getSessionId();
        String userId = requestParameter.getUserId();
        String agentId = requestParameter.getAgentId();
        String terminalSessionId = requestParameter.getTerminalSessionId();
        String message = requestParameter.getMessage();

        // 2. 绑定终端会话（ThreadLocal，支持异步线程继承）
        if (terminalSessionId != null && !terminalSessionId.isEmpty()) {
            setCurrentTerminalSession(terminalSessionId);
        } else {
            // 尝试从会话绑定中获取
            String boundTerminal = getTerminalSession(sessionId);
            if (boundTerminal != null) {
                setCurrentTerminalSession(boundTerminal);
            }
        }

        // 3. 初始化上下文
        dynamicContext.setSessionId(sessionId); // 会话 ID 用于绑定终端会话
        dynamicContext.setUserId(userId); // 用户 ID 用于绑定用户会话
        dynamicContext.setAgentId(agentId); // 智能体 ID 用于绑定智能体会话
        dynamicContext.setTerminalSessionId(terminalSessionId);
        dynamicContext.setMessageHistory(new java.util.ArrayList<>()); // 初始化消息历史
        dynamicContext.setCurrentToolCalls(new java.util.ArrayList<>()); // 初始化当前工具调用列表
        dynamicContext.setCurrentToolResults(new java.util.ArrayList<>()); // 初始化当前工具执行结果列表
        dynamicContext.setCurrentStep(new AtomicInteger(0)); // 初始化当前步数为 0
        dynamicContext.setMaxSteps(DEFAULT_MAX_STEPS); // 设置最大步数
        dynamicContext.setMaxToolCalls(DEFAULT_MAX_TOOL_CALLS); // 设置最大工具调用次数
        dynamicContext.setMaxToolCallsPerRound(DEFAULT_MAX_TOOL_CALLS_PER_ROUND); // 设置每轮最大工具调用次数

        // 4. 初始化结果 DTO
        ReActResultDTO result = ReActResultDTO.builder()
                .totalSteps(0)
                .totalToolCalls(0)
                .maxStepsReached(false)
                .userStopped(false)
                .idleTimeout(false)
                .build();
        dynamicContext.setResult(result);

        // 5. 追加用户消息到历史
        dynamicContext.appendUserMessage(message);

        log.info("ReAct RootNode - 初始化完成 sessionId={}, userId={}, agentId={}, terminalSessionId={}",
                sessionId, userId, agentId, terminalSessionId);

        // 6. 路由到 AI 调用节点
        return router(requestParameter, dynamicContext);
    }

    @Override
    public StrategyHandler<ChatRequestDTO, DefaultReActFactory.DynamicContext, ReActResultDTO> get(
            ChatRequestDTO requestParameter,
            DefaultReActFactory.DynamicContext dynamicContext) throws Exception {
        return getBean("reactAiCallNode");
    }

}
