package com.faind.global.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
  INVALID_INPUT(HttpStatus.BAD_REQUEST, "E400", "요청 값이 올바르지 않습니다."),
  UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "E401", "인증이 필요합니다."),
  INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "E401_01", "아이디 또는 비밀번호가 올바르지 않습니다."),
  TOO_MANY_LOGIN_ATTEMPTS(HttpStatus.TOO_MANY_REQUESTS, "E429_01", "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요."),
  FORBIDDEN(HttpStatus.FORBIDDEN, "E403", "권한이 없습니다."),
  ADMIN_ONLY(HttpStatus.FORBIDDEN, "E403_01", "관리자만 수행할 수 있는 작업입니다."),
  NOT_FOUND(HttpStatus.NOT_FOUND, "E404", "요청한 리소스를 찾을 수 없습니다."),
  USER_NOT_FOUND(HttpStatus.NOT_FOUND, "E404_01", "사용자를 찾을 수 없습니다."),
  DEVICE_NOT_FOUND(HttpStatus.NOT_FOUND, "E404_02", "기기를 찾을 수 없습니다."),
  INCIDENT_NOT_FOUND(HttpStatus.NOT_FOUND, "E404_03", "출동 건을 찾을 수 없습니다."),
  REPORT_NOT_FOUND(HttpStatus.NOT_FOUND, "E404_04", "보고서를 찾을 수 없습니다."),
  ORGANIZATION_NOT_FOUND(HttpStatus.NOT_FOUND, "E404_05", "조직을 찾을 수 없습니다."),
  DUPLICATE_BADGE_NUMBER(HttpStatus.CONFLICT, "E409_01", "이미 등록된 사번입니다."),
  DUPLICATE_SERIAL_NO(HttpStatus.CONFLICT, "E409_02", "이미 등록된 기기 시리얼 번호입니다."),
  DUPLICATE_ORGANIZATION_CODE(HttpStatus.CONFLICT, "E409_05", "이미 사용 중인 조직 코드입니다."),
  INVALID_INCIDENT_STATE(HttpStatus.CONFLICT, "E409_03", "현재 출동 상태에서는 수행할 수 없는 작업입니다."),
  REPORT_ALREADY_SUBMITTED(HttpStatus.CONFLICT, "E409_04", "이미 제출된 보고서는 수정할 수 없습니다."),
  EXTERNAL_SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "E503", "외부 서비스에 일시적으로 연결할 수 없습니다."),
  INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "E500", "서버 내부 오류가 발생했습니다.");

  private final HttpStatus status;
  private final String code;
  private final String message;

  ErrorCode(HttpStatus status, String code, String message) {
    this.status = status;
    this.code = code;
    this.message = message;
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }

  public String getMessage() {
    return message;
  }
}
