package com.FA.ai.config;

import com.FA.ai.domain.agent.model.valobj.properties.AiAgentAutoConfigProperties;
import com.FA.ai.domain.agent.service.IArmoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Configuration;

import javax.annotation.Resource;
import java.util.ArrayList;

@Slf4j
@Configuration
@EnableConfigurationProperties(AiAgentAutoConfigProperties.class)
public class AiAgentAutoConfig implements ApplicationListener<ApplicationReadyEvent> {

    @Resource
    private AiAgentAutoConfigProperties aiAgentAutoConfigProperties;

    @Resource
    private IArmoryService armoryService;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        if (!aiAgentAutoConfigProperties.isEnabled()) {
            log.info("AI Agent 自动装配已关闭");
            return;
        }

        try {
            log.info("Ai Agent 智能体装配，数量：{}", aiAgentAutoConfigProperties.getTables().size());

            armoryService.acceptArmoryAgents(new ArrayList<>(aiAgentAutoConfigProperties.getTables().values()));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

}
