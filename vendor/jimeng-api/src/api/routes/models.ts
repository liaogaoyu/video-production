import _ from 'lodash';

export default {

    prefix: '/v1',

    get: {
        '/models': async () => {
            return {
                "data": [
                    {
                        "id": "jimeng",
                        "object": "model",
                        "owned_by": "jimeng-api"
                    },
                    {
                        "id": "jimeng-video-seedance-2.0",
                        "object": "model",
                        "owned_by": "jimeng-api",
                        "description": "Seedance 2.0（国内站 + 国际站 us/hk/jp/sg）"
                    },
                    {
                        "id": "jimeng-video-seedance-2.0-fast",
                        "object": "model",
                        "owned_by": "jimeng-api",
                        "description": "Seedance 2.0 Fast（国内站 + 国际站 us/hk/jp/sg）"
                    },
                    {
                        "id": "jimeng-video-3.0",
                        "object": "model",
                        "owned_by": "jimeng-api",
                        "description": "即梦AI视频生成模型 3.0 版本"
                    },
                    {
                        "id": "jimeng-video-3.0-pro",
                        "object": "model",
                        "owned_by": "jimeng-api",
                        "description": "即梦AI视频生成模型 3.0 专业版"
                    },
                    {
                        "id": "jimeng-video-2.0",
                        "object": "model",
                        "owned_by": "jimeng-api",
                        "description": "即梦AI视频生成模型 2.0 版本"
                    },
                    {
                        "id": "jimeng-video-2.0-pro",
                        "object": "model",
                        "owned_by": "jimeng-api",
                        "description": "即梦AI视频生成模型 2.0 专业版"
                    }
                ]
            };
        }

    }
}