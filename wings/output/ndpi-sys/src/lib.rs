use libc::{c_char, c_uint, c_ushort, c_void, size_t, time_t};

pub const NDPI_PROTOCOL_UNKNOWN: u16 = 0;

pub type NDPIDetectionModule = c_void;
pub type NDPIFlowStruct = c_void;

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct NdpiProtocol {
    pub master_protocol: u16,
    pub app_protocol: u16,
    pub category: u32,
}

pub type NdpiProtocolBreed = c_uint;

unsafe extern "C" {
    pub fn ndpi_init_detection_module(
        ndpi_tick_resolution: c_uint,
    ) -> *mut NDPIDetectionModule;

    pub fn ndpi_finalize_initialization(
        module: *mut NDPIDetectionModule,
    );

    pub fn ndpi_exit_detection_module(
        module: *mut NDPIDetectionModule,
    );

    pub fn ndpi_detection_process_packet(
        module: *mut NDPIDetectionModule,
        flow: *mut NDPIFlowStruct,
        packet: *const u8,
        packetlen: c_ushort,
        current_time_ms: time_t,
        src: *mut c_void,
        dst: *mut c_void,
    ) -> NdpiProtocol;

    pub fn ndpi_get_proto_name(
        module: *mut NDPIDetectionModule,
        proto_id: u16,
    ) -> *const c_char;

    pub fn ndpi_category_get_name(
        module: *mut NDPIDetectionModule,
        category: u32,
    ) -> *const c_char;

    pub fn ndpi_detection_get_sizeof_ndpi_flow_struct() -> size_t;

    pub fn ndpi_free_flow_data(
        flow: *mut NDPIFlowStruct,
    );
}
