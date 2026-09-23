package com.FA.ai.domain.agent.service.armory.matter.mcp.client.factory;

import com.FA.ai.domain.agent.model.valobj.AiAgentConfigTableVO;
import com.FA.ai.domain.agent.service.armory.matter.mcp.client.TooMcpCreateService;
import com.FA.ai.domain.agent.service.armory.matter.mcp.client.impl.LocalToolMcpCreateService;
import com.FA.ai.domain.agent.service.armory.matter.mcp.client.impl.SSEToolMcpCreateService;
import com.FA.ai.domain.agent.service.armory.matter.mcp.client.impl.StdioToolMcpCreateService;
import com.FA.ai.types.enums.ResponseCode;
import com.FA.ai.types.exception.AppException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

@Slf4j
@Service
public class DefaultMcpClientFactory {

    @Resource
    private LocalToolMcpCreateService localToolMcpCreateService;

    @Resource
    private SSEToolMcpCreateService sseToolMcpCreateService;

    @Resource
    private StdioToolMcpCreateService stdioToolMcpCreateService;

    public TooMcpCreateService getTooMcpCreateService(AiAgentConfigTableVO.Module.ChatModel.ToolMcp toolMcp) {
        if (null != toolMcp.getLocal()) return localToolMcpCreateService;
        if (null != toolMcp.getSse()) return sseToolMcpCreateService;
        if (null != toolMcp.getStdio()) return stdioToolMcpCreateService;
        throw new AppException(ResponseCode.NOT_FOUND_METHOD.getCode(), ResponseCode.NOT_FOUND_METHOD.getInfo());
    }

}
