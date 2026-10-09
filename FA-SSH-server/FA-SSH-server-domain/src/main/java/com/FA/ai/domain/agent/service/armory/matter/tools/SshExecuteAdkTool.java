package com.FA.ai.domain.agent.service.armory.matter.tools;

import com.FA.ai.domain.ssh.service.terminal.ISshTerminalService;
import com.google.adk.tools.Annotations.Schema;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * 在 SSH 终端执行命令。
 * <p>
 * 从 ThreadLocal 或会话级变量获取终端会话 ID，执行命令后返回结果。
 * <p>
 * 案例 1：成功执行
 * <pre>
 *   currentTerminalSession = "ssh-session-001"
 *   command = "df -h"
 *
 *   返回：
 *   {
 *     "command": "df -h",
 *     "output": "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   20G   30G  40% /",
 *     "success": true
 *   }
 * </pre>
 * <p>
 * 案例 2：命令不存在
 * <pre>
 *   command = "nonexistent-command"
 *
 *   返回：
 *   {
 *     "command": "nonexistent-command",
 *     "output": "command not found: nonexistent-command",
 *     "success": false,
 *     "suggestion": "命令不存在。可能原因：命令拼写错误..."
 *   }
 * </pre>
 * <p>
 * 案例 3：危险命令被拦截
 * <pre>
 *   command = "rm -rf /"
 *
 *   返回：
 *   {
 *     "command": "rm -rf /",
 *     "output": "⚠️ 危险命令被拦截: rm -rf /\n该命令可能导致系统损坏或数据丢失。",
 *     "success": false
 *   }
 * </pre>
 */
@Slf4j
@Service
public class SshExecuteAdkTool {

    @Resource
    private ISshTerminalService sshTerminalService;

    // 当前线程的终端会话 ID（使用 InheritableThreadLocal 支持异步线程继承）
    private static final InheritableThreadLocal<String> currentTerminalSession = new InheritableThreadLocal<>();

    /** 当前会话级终端会话ID（由 Controller 设置，优先级低于 ThreadLocal） */
    private static volatile String sessionTerminalSessionId;

    // 危险命令模式（需要用户确认），这些命令，也可以设计成配置来使用
    private static final Pattern DANGEROUS_PATTERN = Pattern.compile(
            "\\b(rm\\s+-rf\\s+/|dd\\s+if=|mkfs\\.|:\\(\\)\\s*\\{|>\\s*/dev/sd|chmod\\s+-R\\s+777\\s+/)\\b",
            Pattern.CASE_INSENSITIVE
    );

    /**
     * 设置当前线程的终端会话 ID（兼容旧接口）
     */
    public static void setCurrentTerminalSession(String terminalSessionId) {
        currentTerminalSession.set(terminalSessionId);
        sessionTerminalSessionId = terminalSessionId;
        log.info("[ThreadLocal] 设置终端会话: thread={}, terminalSession={}",
                Thread.currentThread().getName(), terminalSessionId);
    }

    /**
     * 清除当前线程的终端会话 ID
     */
    public static void clearCurrentTerminalSession() {
        currentTerminalSession.remove();
        sessionTerminalSessionId = null;
    }

    /**
     * 在 SSH 终端执行命令
     * 
     * @param command 要执行的 Shell 命令
     * @return 执行结果
     */
    public Map<String, Object> executeCommand(
            @Schema(name = "command", description = "要执行的 Shell 命令，如: ls -la, apt install docker.io, docker --version")
            String command) {
        
        // 优先从 ThreadLocal 获取，支持异步线程继承
        String terminalSessionId = currentTerminalSession.get();

        // ThreadLocal 为空时回退到会话级变量（线程池场景下 ThreadLocal 可能失效）
        if (terminalSessionId == null || terminalSessionId.isEmpty()) {
            terminalSessionId = sessionTerminalSessionId;
            log.info("[executeCommand] ThreadLocal 为空，回退到会话级变量: terminalSessionId={}", terminalSessionId);
        }

        log.info("[executeCommand] thread={}, terminalSessionId={}, command={}",
                Thread.currentThread().getName(), terminalSessionId, command);
        
        if (terminalSessionId == null || terminalSessionId.isEmpty()) {
            log.warn("[executeCommand] 终端会话ID为空，无法执行命令");
            return Map.of(
                    "success", false,
                    "output", "未绑定 SSH 终端会话。请先打开 SSH 终端连接。",
                    "command", command
            );
        }

        // 检查会话是否存在
        if (!sshTerminalService.sessionExists(terminalSessionId)) {
            log.warn("[executeCommand] 终端会话不存在: {}", terminalSessionId);
            return Map.of(
                    "success", false,
                    "output", "SSH 终端会话不存在或已关闭: " + terminalSessionId,
                    "command", command
            );
        }

        // 危险命令检测
        if (DANGEROUS_PATTERN.matcher(command).find()) {
            return Map.of(
                    "success", false,
                    "output", "⚠️ 危险命令被拦截: " + command + "\n该命令可能导致系统损坏或数据丢失。如确需执行，请手动在终端操作。",
                    "command", command
            );
        }

        try {
            log.info("SSH 执行命令: session={}, command={}", terminalSessionId, command);
            
            // 执行命令
            String output = sshTerminalService.executeCommand(terminalSessionId, command);
            
            log.info("SSH 命令执行完成: outputLength={}, output={}", 
                    output.length(), output.length() > 300 ? output.substring(0, 300) + "..." : output);
            
            // 分析输出，判断是否成功
            boolean success = isExecutionSuccessful(output);
            
            Map<String, Object> result = new java.util.HashMap<>();
            result.put("command", command);
            result.put("output", output);
            result.put("success", success);
            
            if (!success) {
                result.put("suggestion", analyzeError(output));
            }
            
            return result;
            
        } catch (Exception e) {
            log.error("SSH 命令执行异常: session={}, command={}", terminalSessionId, command, e);
            return Map.of(
                    "success", false,
                    "output", "命令执行异常: " + e.getMessage(),
                    "command", command
            );
        }
    }

    /**
     * 判断命令执行是否成功
     */
    private boolean isExecutionSuccessful(String output) {
        if (output == null || output.isEmpty()) {
            return true;
        }
        
        String lowerOutput = output.toLowerCase();
        String[] errorIndicators = {
                "command not found", "no such file or directory", "permission denied",
                "operation not permitted", "cannot find", "error:", "failed",
                "fatal:", "unable to", "connection refused", "network is unreachable"
        };
        
        for (String indicator : errorIndicators) {
            if (lowerOutput.contains(indicator)) {
                return false;
            }
        }
        return true;
    }

    /**
     * 分析错误并提供解决建议
     */
    private String analyzeError(String output) {
        if (output == null) return null;
        
        String lowerOutput = output.toLowerCase();
        
        if (lowerOutput.contains("command not found")) {
            return "命令不存在。可能原因：命令拼写错误、软件未安装、或命令不在 PATH 中。建议检查命令名称或安装对应软件包。";
        }
        if (lowerOutput.contains("permission denied")) {
            return "权限不足。建议使用 sudo 提升权限，或检查文件/目录权限。";
        }
        if (lowerOutput.contains("no such file or directory")) {
            return "文件或目录不存在。建议检查路径是否正确，或使用绝对路径。";
        }
        if (lowerOutput.contains("connection refused") || lowerOutput.contains("network is unreachable")) {
            return "网络连接问题。建议检查网络连接、确认目标服务是否运行、检查防火墙设置。";
        }
        return "执行失败，请检查命令和输出信息。";
    }

}
