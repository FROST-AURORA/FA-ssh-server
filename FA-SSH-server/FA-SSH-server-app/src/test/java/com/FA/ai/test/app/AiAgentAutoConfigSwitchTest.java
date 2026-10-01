package com.FA.ai.test.app;

import com.FA.ai.config.AiAgentAutoConfig;
import com.FA.ai.domain.agent.model.valobj.AiAgentConfigTableVO;
import com.FA.ai.domain.agent.model.valobj.properties.AiAgentAutoConfigProperties;
import com.FA.ai.domain.agent.service.IArmoryService;
import org.junit.Assert;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class AiAgentAutoConfigSwitchTest {

    @Test
    public void disabledByDefaultSkipsAssemblyWithoutTables() {
        assertAssemblySkipped(new AiAgentAutoConfigProperties());
    }

    @Test
    public void explicitlyDisabledSkipsConfiguredAgents() {
        AiAgentAutoConfigProperties properties = new AiAgentAutoConfigProperties();
        properties.setEnabled(false);
        properties.setTables(Map.of("test-agent", new AiAgentConfigTableVO()));
        assertAssemblySkipped(properties);
    }

    @Test
    public void enabledAssemblesConfiguredAgents() {
        AiAgentConfigTableVO table = new AiAgentConfigTableVO();
        AiAgentAutoConfigProperties properties = new AiAgentAutoConfigProperties();
        properties.setEnabled(true);
        properties.setTables(Map.of("test-agent", table));
        AtomicReference<List<AiAgentConfigTableVO>> assembled = new AtomicReference<>();

        createConfig(properties, assembled::set).onApplicationEvent(null);

        Assert.assertEquals(List.of(table), assembled.get());
    }

    @Test
    public void enabledPropagatesAssemblyFailure() {
        AiAgentAutoConfigProperties properties = new AiAgentAutoConfigProperties();
        properties.setEnabled(true);
        properties.setTables(Map.of("test-agent", new AiAgentConfigTableVO()));
        Exception failure = new Exception("MCP initialization failed");
        AiAgentAutoConfig config = createConfig(properties, tables -> { throw failure; });

        try {
            config.onApplicationEvent(null);
            Assert.fail("Enabled assembly must report initialization failures");
        } catch (RuntimeException exception) {
            Assert.assertSame(failure, exception.getCause());
        }
    }

    private void assertAssemblySkipped(AiAgentAutoConfigProperties properties) {
        AtomicInteger calls = new AtomicInteger();
        createConfig(properties, tables -> calls.incrementAndGet()).onApplicationEvent(null);
        Assert.assertEquals(0, calls.get());
    }

    private AiAgentAutoConfig createConfig(AiAgentAutoConfigProperties properties, IArmoryService service) {
        AiAgentAutoConfig config = new AiAgentAutoConfig();
        ReflectionTestUtils.setField(config, "aiAgentAutoConfigProperties", properties);
        ReflectionTestUtils.setField(config, "armoryService", service);
        return config;
    }
}
