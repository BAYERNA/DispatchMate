package com.faind.integration.notification;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.client.RestClient;

class NotificationHttpAdapterTest {
  @Test void sendsConfiguredBearerToken() {
    RestClient.Builder builder = RestClient.builder();
    var environment = new MockEnvironment()
        .withProperty("faind.integration.notification-server.base-url", "http://notification")
        .withProperty("faind.integration.notification-server.token", "test-shared-token");
    // Unit-test configured default headers; full cross-service delivery remains an integration test.
    RestClient.Builder spy = org.mockito.Mockito.spy(builder);
    new NotificationHttpAdapter(spy, environment);
    org.mockito.Mockito.verify(spy).defaultHeader("Authorization", "Bearer test-shared-token");
  }
}
