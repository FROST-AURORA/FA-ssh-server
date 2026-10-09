package com.FA.ai.domain.agent.service.armory.matter.session.model;

import com.google.adk.events.Event;
import com.google.adk.sessions.SessionKey;
import com.google.adk.sessions.State;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionSnapshot {

    private SessionKey sessionKey; // 会话标识
    private State state; // 会话状态
    private List<Event> rawEvents; // 历史事件
    private Instant lastUpdateTime; // 最后更新时间

}