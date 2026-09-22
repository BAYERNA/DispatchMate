package com.faind.domain.device.service;

import com.faind.domain.auth.service.AccountService;
import com.faind.domain.device.dto.DeviceResponse;
import com.faind.domain.device.entity.Device;
import com.faind.domain.device.repository.DeviceRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// ADM-006 "매핑 변경" 전용 서비스. 등록(DeviceService.register)과 책임을 분리해,
// 매핑만 바꾸는 흐름에서 등록 관련 검증(시리얼 중복 등)이 다시 실행되지 않도록 한다.
@Service
public class DeviceMappingService {

  private final DeviceRepository deviceRepository;
  private final DeviceService deviceService;
  private final AccountService accountService;

  public DeviceMappingService(
      DeviceRepository deviceRepository, DeviceService deviceService, AccountService accountService) {
    this.deviceRepository = deviceRepository;
    this.deviceService = deviceService;
    this.accountService = accountService;
  }

  @Transactional
  public DeviceResponse remap(UUID organizationId, UUID deviceId, UUID newUserId) {
    Device device = deviceRepository.findById(deviceId)
        .orElseThrow(() -> new BusinessException(ErrorCode.DEVICE_NOT_FOUND));
    if (!device.getOrganizationId().equals(organizationId)) {
      throw new BusinessException(ErrorCode.DEVICE_NOT_FOUND);
    }
    // getAccount()가 organizationId까지 검증하므로, 다른 조직 소속 대원에게 기기를 매핑하는
    // 경로를 여기서 함께 차단한다(멀티테넌시 1단계).
    accountService.getAccount(organizationId, newUserId);
    device.remap(newUserId);
    return deviceService.get(deviceId);
  }
}
